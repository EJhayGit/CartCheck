// Local app/API fixtures only. No production requests or email delivery.
const { chromium } = require(process.env.CARTCHECK_PLAYWRIGHT)
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = 'http://127.0.0.1:4177'
const output = path.resolve(__dirname, '../../docs/design/final-release-review')

;(async () => {
  const fixture = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../server/.test-runs/preview-session.json'), 'utf8'))
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const report = { actualBackend: true, productionAccess: false, layouts: [], checks: [], errors: [], externalRequests: [] }
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  await context.addCookies([{ ...fixture.cookie, url: base, httpOnly: true, sameSite: 'Lax' }])
  await context.route('**/*', (route) => {
    if (route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:')) return route.continue()
    report.externalRequests.push(route.request().url()); return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => report.errors.push(e.message))
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(base + '/lists')
      await page.evaluate((value) => localStorage.setItem('cartcheck.appearance', value), theme)
      for (const [name, route, heading] of [
        ['lists', '/lists', 'My Lists'],
        ['shopping', `/lists/${fixture.lists.weekly}`, 'Weekly Groceries'],
        ['catalog', '/catalog', 'Grocery catalog'],
        ['trips', '/trips', 'Trip history'],
        ['settings', '/settings', 'Settings'],
      ]) {
        await page.goto(base + route)
        await page.getByRole('heading', { name: heading, exact: true }).waitFor()
        const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }))
        assert.ok(layout.scrollWidth <= width, `Overflow: ${name}-${width}-${theme}`)
        assert.equal(layout.theme, theme)
        assert.equal(layout.reducedMotion, true)
        await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`), fullPage: true })
        report.layouts.push({ screen: name, ...layout })
      }
    }
    report.checks.push('Five private screens: 390/768/1440/1920, light/dark, no horizontal overflow; reduced-motion preference active')
    await page.goto(base + '/lists')
    await page.getByRole('heading', { name: 'My Lists', exact: true }).waitFor()
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => document.activeElement !== document.body))
    report.checks.push('Keyboard Tab reaches a focusable control')

    // Changing the shared context cookie emulates a second tab signing into B.
    const second = await context.newPage()
    await context.addCookies([{ ...fixture.emptyCookie, url: base, httpOnly: true, sameSite: 'Lax' }])
    await second.goto(base + '/lists')
    await second.getByRole('heading', { name: 'My Lists', exact: true }).waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByText('No lists yet', { exact: false }).waitFor()
    assert.equal(await page.getByText('Weekly Groceries', { exact: true }).count(), 0)
    report.checks.push('Shared-cookie account switch revalidates the first tab and clears account A lists')
    await context.clearCookies()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
    report.checks.push('Shared-cookie logout clears private screens')
    for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((value) => localStorage.setItem('cartcheck.appearance', value), theme)
      await page.reload()
      await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `signin-${width}-${theme}.png`), fullPage: true })
    }
    report.checks.push('Sign-in screen: all four widths in both themes without overflow')
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.externalRequests, [])
    report.success = true
  } catch (e) {
    report.success = false; report.failure = e.message; process.exitCode = 1
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ success: report.success, layouts: report.layouts.length, checks: report.checks, failure: report.failure }, null, 2))
    await browser.close()
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1 })
