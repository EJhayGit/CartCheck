// Run with the isolated Vite review server on port 4176. Requires the bundled
// Playwright package path via CARTCHECK_PLAYWRIGHT; uses installed Edge.
const { chromium } = require(process.env.CARTCHECK_PLAYWRIGHT)
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = 'http://127.0.0.1:4176'
const output = path.resolve(__dirname, '../../docs/design/ux-review')

;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const checks = []
  const screenshots = []
  const reset = async (query = '') => { await page.request.get(`${base}/__preview/reset?${query}`) }
  const nav = (name) => page.getByRole('navigation', { name: page.viewportSize().width <= 700 ? 'Mobile navigation' : 'Main navigation', exact: true }).getByRole('button', { name, exact: true })
  async function load(theme = 'dark', query = '', suffix = '') {
    await reset(query)
    await page.goto(base + '/__preview/state')
    await page.evaluate((theme) => localStorage.setItem('cartcheck.appearance', theme), theme)
    await page.goto(base + suffix)
    await page.getByRole('heading', { name: query.includes('auth=out') ? (suffix.includes('reset') ? 'Reset password' : suffix.includes('verify') ? 'Email verified' : 'Sign in') : 'My Shopping List', exact: true }).waitFor()
  }
  async function capture(name) {
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
    screenshots.push(name)
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, canvas: getComputedStyle(document.querySelector('.app')).backgroundColor, surface: getComputedStyle(document.querySelector('.catalog-panel, .budget-panel, .auth-card') || document.body).backgroundColor }))
    assert.ok(layout.scrollWidth <= layout.width, `Overflow on ${name}: ${JSON.stringify(layout)}`)
    checks.push({ name, ...layout })
  }
  for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await load(theme)
    await capture(`shopping-${width}-${theme}`)
    await page.getByLabel('Sort', { exact: true }).selectOption('az')
    await capture(`shopping-az-${width}-${theme}`)
    await page.getByLabel('Sort', { exact: true }).selectOption('unpurchased')
    await capture(`shopping-unpurchased-${width}-${theme}`)
    await nav('Catalog').click()
    await page.getByLabel('Search catalog').fill('rice')
    await capture(`catalog-rice-${width}-${theme}`)
    await page.getByLabel('Search catalog').fill('Pechay')
    await page.getByRole('button', { name: 'Customize', exact: true }).click()
    await capture(`customize-${width}-${theme}`)
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
    await nav('Trips').click()
    await page.getByRole('button', { name: 'View details' }).waitFor()
    await capture(`trips-${width}-${theme}`)
    await nav('Settings').click()
    await capture(`settings-${width}-${theme}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const theme of ['light', 'dark']) for (const mode of ['under', 'reached', 'over', 'none', 'zero']) {
    await load(theme, `budget=${mode}`)
    await capture(`budget-${mode}-${theme}`)
  }
  for (const currency of ['USD', 'EUR']) {
    await load('dark', `currency=${currency}`)
    await capture(`budget-${currency}-dark`)
  }
  for (const theme of ['light', 'dark']) {
    await load(theme)
    await page.getByRole('button', { name: 'Finish shopping', exact: true }).click()
    await page.getByRole('heading', { name: 'Finish shopping?' }).waitFor()
    await capture(`finish-review-${theme}`)
  }
  // Actual localhost HTTP requests are throttled via Chromium CDP. The fixture
  // server also delays PATCH responses, making early DOM checks deterministic.
  const cdp = await page.context().newCDPSession(page)
  const results = []
  for (const slow of [false, true]) {
    await load('dark', 'delay=1500')
    await page.getByLabel('Sort', { exact: true }).selectOption('az')
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: slow ? 400 : 0, downloadThroughput: slow ? 50000 : -1, uploadThroughput: slow ? 50000 : -1, connectionType: slow ? 'cellular3g' : 'ethernet' })
    const early = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('input[type="checkbox"]')].filter((input) => !input.checked).slice(0, 10)
      const start = performance.now()
      for (const input of controls) input.click()
      return { milliseconds: performance.now() - start, checked: controls.every((input) => input.checked) }
    })
    assert.equal(early.checked, true)
    await page.getByText('1 remaining / 13 purchased', { exact: true }).waitFor()
    await capture(`purchased-ten-${slow ? 'slow3g' : 'normal'}-dark`)
    await nav('Catalog').click() // Navigation remains available during PATCHes.
    await nav('Shopping list').click()
    let state
    const deadline = Date.now() + 15000
    do {
      state = await (await page.request.get(`${base}/__preview/state`)).json()
      if (state.cart.items.filter((item) => item.bought).length === 13) break
      await page.waitForTimeout(200)
    } while (Date.now() < deadline)
    assert.equal(state.cart.items.filter((item) => item.bought).length, 13)
    assert.equal(state.calls.filter((call) => call.method === 'PATCH').length, 10)
    assert.equal(state.calls.filter((call) => call.path === '/api/cart' && call.method === 'GET').length, 1)
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await page.reload()
    await page.getByText('1 remaining / 13 purchased', { exact: true }).waitFor()
    results.push({ network: slow ? 'Slow 3G' : 'normal', ...early, finalBought: 13, independentRequests: 10, cartGetsBeforeReload: 1, navigationDuringMutation: true, reloadPersisted: true })
  }
  await load('dark', 'delay=300')
  await page.getByLabel('Sort', { exact: true }).selectOption('az')
  await page.evaluate(() => { const input = document.querySelector('input[aria-label="Mark Chicken as purchased"]'); for (let n = 0; n < 4; n++) input.click() })
  await page.waitForTimeout(900)
  let state = await (await page.request.get(`${base}/__preview/state`)).json()
  assert.equal(state.cart.items.find((item) => item.name === 'Chicken').bought, false)
  assert.equal(await page.getByRole('checkbox', { name: 'Mark Chicken as purchased' }).isChecked(), false)
  results.push({ sameItemFinal: false, uiAndFixtureServerAgree: true, writes: state.calls.filter((call) => call.method === 'PATCH').length })
  await page.request.get(`${base}/__preview/fail-next`)
  await page.getByRole('checkbox', { name: 'Mark Chicken as purchased' }).click()
  await page.getByText("Couldn't save that change. Please try again.").waitFor()
  assert.equal(await page.getByRole('checkbox', { name: 'Mark Chicken as purchased' }).isChecked(), false)
  await capture('purchase-failure-dark')
  results.push({ failedWriteRollback: true, notification: true })
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await load('dark', 'auth=out')
    await capture(`signin-${width}-dark`)
    await page.getByRole('button', { name: 'Create an account', exact: true }).click()
    await capture(`register-${width}-dark`)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: /Forgot password/ }).click()
    await capture(`recovery-${width}-dark`)
    await load('dark', 'auth=out', '/#action=verify&token=fixture')
    await capture(`verification-${width}-dark`)
    await load('dark', 'auth=out', '/#action=reset&token=fixture')
    await capture(`reset-password-${width}-dark`)
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify({ checks, results, errors }, null, 2))
  await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CartCheck local UX review</title><style>body{font:16px system-ui;background:#0d0f0e;color:#f4f6f5;margin:24px}section{margin-bottom:32px}img{max-width:100%;border:1px solid #3b423e}a{color:#b2e7bc}</style><h1>CartCheck local UX review</h1><p>Fictitious fixtures only. No production data or real emails.</p><p><a href="checks.json">Layout and responsiveness checks</a></p>${screenshots.map((name) => `<section><h2>${name}</h2><a href="${name}.png"><img loading="lazy" src="${name}.png" alt="${name}"></a></section>`).join('')}`)
  console.log(JSON.stringify({ screenshots: screenshots.length, results, errors }))
  await browser.close()
})().catch((error) => { console.error(error); process.exit(1) })
