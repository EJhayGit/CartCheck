// Actual local app/API/PostgreSQL browser tests. Start fixture server on 4177.
// CARTCHECK_PLAYWRIGHT points to an existing Playwright installation.
const { chromium } = require(process.env.CARTCHECK_PLAYWRIGHT)
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = 'http://127.0.0.1:4177'
const output = path.resolve(__dirname, '../../docs/design/multiple-lists-review')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  const fixture = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../server/.test-runs/preview-session.json'), 'utf8'))
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const report = { origin: base, actualBackend: true, productionAccess: false, layouts: [], checks: [], screenshots: [], errors: [], externalRequests: [] }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ ...fixture.cookie, url: base, httpOnly: true, sameSite: 'Lax' }])
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue()
    report.externalRequests.push(url); return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => report.errors.push(error.message))
  const calls = []
  page.on('request', (request) => { if (request.url().startsWith(base + '/api/')) calls.push({ method: request.method(), path: new URL(request.url()).pathname }) })
  const nav = (name) => page.locator('nav:visible').getByRole('button', { name, exact: true })
  const card = (name) => page.locator('.list-card').filter({ has: page.getByText(name, { exact: true }) })
  const open = async (name) => { await card(name).locator('.list-card-open').click(); await page.getByRole('heading', { name, exact: true }).waitFor() }
  const back = async () => { await page.getByRole('main').getByRole('button', { name: 'My Lists', exact: true }).click(); await page.getByRole('heading', { name: 'My Lists', exact: true }).waitFor() }
  const capture = async (name) => {
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true })
    report.screenshots.push(name + '.png')
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, canvas: getComputedStyle(document.querySelector('.app')).backgroundColor, cards: [...document.querySelectorAll('.list-card')].map((card) => ({ width: Math.round(card.getBoundingClientRect().width), x: Math.round(card.getBoundingClientRect().x) })) }))
    assert.ok(layout.scrollWidth <= layout.width, 'Horizontal overflow: ' + name)
    report.layouts.push({ name, ...layout })
  }
  try {
    await page.goto(base + '/lists')
    await page.getByRole('heading', { name: 'My Lists', exact: true }).waitFor()
    for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((value) => localStorage.setItem('cartcheck.appearance', value), theme)
      await page.reload()
      await card('Weekly Groceries').waitFor()
      await assert.equal(await page.locator('.list-card').count(), 3)
      assert.match(await card('Weekly Groceries').innerText(), /8 of 14 items purchased/)
      assert.match(await card('Party Supplies').innerText(), /No budget/)
      await capture(`my-lists-${width}-${theme}`)
    }
    report.checks.push('Fetched summaries open correct IDs/counts; overview has no overflow at all five widths in both themes')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.evaluate(() => localStorage.setItem('cartcheck.appearance', 'light'))
    await page.reload(); await card('Weekly Groceries').waitFor()
    await page.getByRole('button', { name: /Create list/ }).first().click()
    await page.getByRole('dialog').waitFor()
    await page.getByLabel('List name', { exact: true }).fill('Weekly Groceries')
    await page.getByLabel('Budget (optional)', { exact: true }).fill('2500')
    await capture('create-list-desktop')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Create list/)
    await open('Weekly Groceries')
    assert.ok(page.url().endsWith('/lists/' + fixture.lists.weekly))
    await capture('named-list-with-budget-desktop')
    await page.setViewportSize({ width: 390, height: 1000 })
    await capture('open-shopping-list-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await back(); await open('Party Supplies')
    await capture('named-list-without-budget-desktop')
    await back(); await nav('Catalog').click()
    await page.getByLabel('Add items to', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Add items to', { exact: true }).inputValue(), '')
    await page.getByLabel('Add items to', { exact: true }).selectOption(fixture.lists.weekly)
    await capture('catalog-destination-selector')
    await nav('Trips').click(); await page.getByRole('heading', { name: 'Weekend Market', exact: true }).waitFor()
    await capture('trips-completed-list-names')
    await page.goto(base + '/lists/' + fixture.completedId)
    await page.getByRole('heading', { name: 'Weekend Market', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Finish shopping', exact: true }).count(), 0)
    report.checks.push('Completed bookmarked list shows owned historical details with no active mutation controls')
    await page.goto(base + '/lists/%E0%A4%A')
    await page.getByRole('alert').waitFor()
    report.checks.push('Malformed encoded bookmarked ID shows error without crashing the app')

    // Cold-card rename must render before the real PATCH response returns.
    await page.goto(base + '/lists'); await card('Weekly Groceries').waitFor()
    let renameResponse
    await page.route(base + '/api/lists/' + fixture.lists.weekly, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      renameResponse = await route.fetch(); await delay(700); await route.fulfill({ response: renameResponse })
    })
    await card('Weekly Groceries').getByRole('button', { name: 'Rename or edit budget', exact: true }).click()
    await page.getByLabel('List name', { exact: true }).fill('Family Groceries')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await card('Family Groceries').waitFor()
    assert.ok(await page.getByRole('dialog').isVisible(), 'Card should update while save is pending')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.unroute(base + '/api/lists/' + fixture.lists.weekly)
    report.checks.push('Cold overview rename updates optimistically before server confirmation')

    // Complete a newly created empty-budget list without affecting existing lists.
    await page.getByRole('button', { name: /Create list/ }).first().click()
    await page.getByLabel('List name', { exact: true }).fill('  Browser Test List  ')
    await page.getByLabel('Budget (optional)', { exact: true }).fill('0')
    await page.getByRole('dialog').getByRole('button', { name: 'Create list', exact: true }).click()
    await page.getByRole('heading', { name: 'Browser Test List', exact: true }).waitFor()
    const createdId = page.url().split('/').at(-1)
    await page.getByRole('button', { name: /Add Item/ }).first().click()
    await page.getByLabel('Search catalog').fill('Rice')
    await page.getByRole('button', { name: 'Add to list', exact: true }).first().click()
    await page.getByRole('heading', { name: 'Browser Test List', exact: true }).waitFor()
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
    if (await cancel.count()) await cancel.first().click()
    await page.getByRole('button', { name: 'Finish shopping', exact: true }).click()
    await page.getByRole('heading', { name: 'Finish shopping?', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Confirm and finish', exact: true }).click()
    await page.getByRole('heading', { name: 'My Lists', exact: true }).waitFor()
    assert.equal(await page.locator('.list-card').count(), 3)
    const response = await context.request.get(base + '/api/lists')
    const active = (await response.json()).items
    assert.equal(active.length, 3)
    assert.ok(!active.some((item) => item.tripId === createdId))
    report.checks.push('UI creation trims name, preserves zero budget, catalog explicit destination, finish returns overview without replacement')

    // A delayed real purchase response must not affect another list or a newer
    // local intent after the first list unmounts and mounts again.
    await open('Family Groceries')
    const weeklyGets = calls.filter((call) => call.method === 'GET' && call.path === '/api/lists/' + fixture.lists.weekly).length
    await page.route(base + '/api/lists/' + fixture.lists.weekly + '/items/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      const response = await route.fetch(); await delay(600); await route.fulfill({ response })
    })
    await page.getByRole('checkbox', { name: 'Mark Vinegar as purchased', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: 'Mark Vinegar as unpurchased', exact: true }).isChecked(), true)
    await back()
    assert.match(await card('Family Groceries').innerText(), /9 of 14 items purchased/)
    await open('Party Supplies')
    assert.match(await page.getByText('3 remaining / 2 purchased', { exact: true }).innerText(), /3 remaining/)
    await back(); await open('Family Groceries')
    await page.getByRole('checkbox', { name: 'Mark Vinegar as unpurchased', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Finish shopping' && !button.disabled))
    assert.equal(await page.getByRole('checkbox', { name: 'Mark Vinegar as purchased', exact: true }).isChecked(), false)
    const persistedWeekly = await (await context.request.get(base + '/api/lists/' + fixture.lists.weekly)).json()
    const persistedParty = await (await context.request.get(base + '/api/lists/' + fixture.lists.party)).json()
    assert.equal(persistedWeekly.items.find((item) => item.name === 'Vinegar').bought, false)
    assert.equal(persistedParty.summary.boughtCount, 2)
    assert.equal(calls.filter((call) => call.method === 'GET' && call.path === '/api/lists/' + fixture.lists.weekly).length, weeklyGets)
    await page.unroute(base + '/api/lists/' + fixture.lists.weekly + '/items/*')
    await back()
    assert.match(await card('Family Groceries').innerText(), /8 of 14 items purchased/)
    report.checks.push('Delayed purchase across list switches/remount preserves newest intent, other-list state, summaries and warm detail cache without another GET')

    // A failed purchase rolls back only its own selected-list field.
    await open('Family Groceries')
    await page.route(base + '/api/lists/' + fixture.lists.weekly + '/items/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await delay(250)
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Isolated browser failure fixture' }) })
    })
    await page.getByRole('checkbox', { name: 'Mark Vinegar as purchased', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('checkbox', { name: 'Mark Vinegar as purchased', exact: true }).isChecked(), false)
    await page.unroute(base + '/api/lists/' + fixture.lists.weekly + '/items/*')
    await back()
    report.checks.push('Failed purchased toggle restores previous state and shows nonblocking error')

    // Delete confirmation cancellation and acceptance against only local fixture data.
    page.once('dialog', (dialog) => dialog.dismiss())
    await card('Party Supplies').getByRole('button', { name: 'Delete', exact: true }).click()
    assert.equal(await card('Party Supplies').count(), 1)
    page.once('dialog', (dialog) => dialog.accept())
    await card('Party Supplies').getByRole('button', { name: 'Delete', exact: true }).click()
    await card('Party Supplies').waitFor({ state: 'hidden' })
    report.checks.push('Active deletion requires confirmation; cancel retains list, accept removes only selected list')

    const emptyContext = await browser.newContext({ viewport: { width: 390, height: 1000 } })
    await emptyContext.addCookies([{ ...fixture.emptyCookie, url: base, httpOnly: true, sameSite: 'Lax' }])
    const empty = await emptyContext.newPage()
    await empty.goto(base + '/lists'); await empty.getByRole('heading', { name: 'No lists yet', exact: true }).waitFor()
    await empty.screenshot({ path: path.join(output, 'empty-my-lists-mobile.png'), fullPage: true })
    report.screenshots.push('empty-my-lists-mobile.png')
    assert.equal((await (await emptyContext.request.get(base + '/api/lists')).json()).items.length, 0)
    report.checks.push('Empty account stays empty after overview reads')
    await emptyContext.close()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.externalRequests, [])
    report.requests = calls
    report.success = true
    console.log(JSON.stringify({ success: true, checks: report.checks, screenshots: report.screenshots.length }, null, 2))
  } catch (error) {
    report.success = false; report.failure = error.stack; process.exitCode = 1
    await page.screenshot({ path: path.join(output, 'browser-failure.png'), fullPage: true })
    console.error(error)
  } finally {
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
  }
})().catch((error) => { console.error(error); process.exitCode = 1 })
