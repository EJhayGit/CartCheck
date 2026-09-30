import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const React = await import('react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true }, appType: 'custom' })
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const { default: AccountFlows } = await vite.ssrLoadModule('/src/AccountFlows.jsx')
const { default: ChangePassword } = await vite.ssrLoadModule('/src/ChangePassword.jsx')
const { PasswordMeter } = await vite.ssrLoadModule('/src/AuthUI.jsx')
const { useAppearance, APPEARANCE_KEY } = await vite.ssrLoadModule('/src/appearance.js')

test.afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete window.matchMedia
  globalThis.fetch = undefined
})

test('appearance persists, follows system changes, and unsubscribes cleanly', () => {
  let listener
  const media = { matches: false, addEventListener: (_, callback) => { listener = callback }, removeEventListener: (_, callback) => { if (listener === callback) listener = null } }
  window.matchMedia = () => media
  function Harness() {
    const [value, setValue] = useAppearance()
    return React.createElement('button', { onClick: () => setValue('system') }, value)
  }
  const view = render(React.createElement(Harness))
  fireEvent.click(screen.getByRole('button', { name: 'light' }))
  assert.equal(window.localStorage.getItem(APPEARANCE_KEY), 'system')
  assert.equal(document.documentElement.dataset.theme, 'light')
  media.matches = true
  listener()
  assert.equal(document.documentElement.dataset.theme, 'dark')
  view.unmount()
  assert.equal(listener, null)
  render(React.createElement(Harness))
  assert.equal(screen.getByRole('button').textContent, 'system')
  assert.equal(document.documentElement.style.colorScheme, 'dark')
})

test('official logo returns registration to sign in without reloading or sending a request', async () => {
  const calls = mockFetch(() => json({ error: 'Sign in required' }, 401))
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }))
  assert.ok(screen.getByRole('heading', { name: 'Create your account' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'CartCheck — Go to home' }).at(-1))
  assert.ok(screen.getByRole('heading', { name: 'Sign in' }))
  assert.equal(calls.length, 1)
})

test('logo cannot leave an account email request while it is pending', async () => {
  let resolveRequest
  mockFetch((url) => url.endsWith('/me') ? json({ error: 'Sign in required' }, 401) : new Promise((resolve) => { resolveRequest = resolve }))
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }))
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form'))
  await waitFor(() => assert.equal(screen.getAllByRole('button', { name: 'CartCheck — Go to home' }).at(-1).disabled, true))
  resolveRequest(json({ message: 'Request accepted.' }))
  await screen.findByRole('status')
  await waitFor(() => assert.equal(screen.getAllByRole('button', { name: 'CartCheck — Go to home' }).at(-1).disabled, false))
})

test.after(async () => {
  await vite.close()
  dom.window.close()
})

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
})

test('resend honors server cooldown and prevents another request', async () => {
  const calls = mockFetch(() => json({ error: 'Please try again later.' }, 429, { 'Retry-After': '120' }))
  render(React.createElement(AccountFlows, { view: 'pending', email: 'shopper@example.test', onBack: () => {} }))
  fireEvent.submit(screen.getByRole('button', { name: 'Resend verification email' }).closest('form'))
  await screen.findByRole('alert')
  await waitFor(() => assert.match(screen.getByRole('button', { name: /Resend available in/ }).textContent, /120s|119s/))
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  assert.equal(calls.length, 1)
})

test('email request failure preserves the address and permits retry', async () => {
  mockFetch(() => json({ error: 'The server is unavailable. Please try again.' }, 503))
  render(React.createElement(AccountFlows, { view: 'pending', email: 'shopper@example.test', onBack: () => {} }))
  fireEvent.submit(screen.getByRole('button', { name: 'Resend verification email' }).closest('form'))
  await screen.findByRole('alert')
  assert.equal(screen.getByLabelText('Email address').value, 'shopper@example.test')
  assert.equal(screen.getByRole('button', { name: 'Resend verification email' }).disabled, false)
})

function mockFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return handler(String(url), options)
  }
  return calls
}

async function openRegistration() {
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'Sign in' })
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await screen.findByRole('heading', { name: 'Create your account' })
}

function fillRegistration({ password = 'violet-river-lantern', confirmation = password } = {}) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } })
}

test('registration rejects missing or mismatched confirmation locally and focuses the confirmation field', async () => {
  const calls = mockFetch((url) => url.endsWith('/api/auth/me')
    ? json({ error: 'unauthenticated' }, 401)
    : json({ error: 'unexpected request' }, 500))
  await openRegistration()
  fillRegistration({ confirmation: 'different-violet-river' })
  fireEvent.submit(screen.getByRole('heading', { name: 'Create your account' }).closest('section').querySelector('form'))

  assert.ok(screen.getAllByRole('alert').some((alert) => /Passwords do not match/.test(alert.textContent)))
  assert.equal(document.activeElement, screen.getByLabelText('Confirm password'))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/register')).length, 0)

  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: '' } })
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  assert.match(screen.getByRole('alert').textContent, /Confirm your password/)
  assert.equal(document.activeElement, screen.getByLabelText('Confirm password'))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/register')).length, 0)
})

test('registration validates 7/8/10 character and UTF-8 byte boundaries before the request', async () => {
  const calls = mockFetch((url) => url.endsWith('/api/auth/me')
    ? json({ error: 'unauthenticated' }, 401)
    : json({ user: { id: 'u1', email: 'shopper@example.test', email_verified: false, verification_required: true, preferred_currency: 'PHP' } }))
  await openRegistration()

  fillRegistration({ password: 'a'.repeat(7) })
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  assert.match(screen.getByRole('alert').textContent, /at least 8 characters/)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/register')).length, 0)

  for (const password of ['a'.repeat(8), 'a'.repeat(10), 'é'.repeat(36), '😀'.repeat(18)]) {
    fillRegistration({ password })
    fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
    await screen.findByRole('heading', { name: 'Check your email' })
    const request = calls.findLast((call) => call.url.endsWith('/api/auth/register'))
    assert.deepEqual(JSON.parse(request.options.body), { email: 'shopper@example.test', password })
    assert.equal(Object.hasOwn(JSON.parse(request.options.body), 'confirmation'), false)
    // Return to the auth form through the pending account's back action.
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    await screen.findByRole('heading', { name: 'Sign in' })
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await screen.findByRole('heading', { name: 'Create your account' })
  }

  fillRegistration({ password: 'é'.repeat(37) })
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  assert.match(screen.getByRole('alert').textContent, /72 UTF-8 bytes or fewer/)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/register')).length, 4)
})

test('registration shows its busy state while the request is pending and accepts form submission', async () => {
  let finishRequest
  const pending = new Promise((resolve) => { finishRequest = resolve })
  const calls = mockFetch((url) => url.endsWith('/api/auth/me') ? json({ error: 'unauthenticated' }, 401) : pending)
  await openRegistration()
  fillRegistration()
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/register')).length, 1)
  assert.equal(screen.getByRole('button', { name: 'Please wait…' }).disabled, true)

  finishRequest(json({ user: { id: 'u1', email: 'shopper@example.test', email_verified: false, verification_required: true, preferred_currency: 'PHP' } }))
  await screen.findByRole('heading', { name: 'Check your email' })
})

test('password visibility preserves value and returns focus to its input', async () => {
  const { container } = render(React.createElement(AccountFlows, { view: 'reset', token: 'test-token', onBack: () => {}, onReset: () => {} }))
  const input = screen.getByLabelText('New password')
  fireEvent.change(input, { target: { value: 'local-test-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))

  assert.equal(input.type, 'text')
  assert.equal(input.value, 'local-test-password')
  assert.equal(document.activeElement, input)
  assert.equal(screen.getByRole('button', { name: 'Hide new password' }).getAttribute('aria-pressed'), 'true')
  assert.ok(container.querySelector('form'))
})

test('password meter updates locally without rendering the password value', async () => {
  const secret = 'violet-river-lantern-73!'
  const { rerender, container } = render(React.createElement(PasswordMeter, { password: 'short', email: 'shopper@example.test' }))
  await screen.findByText('Weak')
  rerender(React.createElement(PasswordMeter, { password: secret, email: 'shopper@example.test' }))
  await screen.findByText('Strong')

  assert.equal(container.textContent.includes(secret), false)
  assert.equal(container.querySelector('input'), null)
  assert.equal(container.querySelector('[role="status"]').textContent.includes(secret), false)
})

test('verification resend is available while pending, then shows confirmation and a cooldown', async () => {
  const calls = mockFetch(() => json({ message: 'If eligible, a verification message was sent.' }))
  render(React.createElement(AccountFlows, { view: 'pending', email: 'shopper@example.test', onBack: () => {} }))
  const button = screen.getByRole('button', { name: 'Resend verification email' })
  assert.equal(button.disabled, false)
  fireEvent.submit(button.closest('form'))

  await screen.findByRole('status')
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /resend-verification$/)
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'shopper@example.test' })
  assert.equal(screen.getByRole('button', { name: /Resend available in/ }).disabled, true)
})

test('verification success closes resend flow; invalid token restores a usable resend path', async () => {
  let verifiedUser
  mockFetch(() => json({ user: { id: 'u1', email: 'shopper@example.test', email_verified: true } }))
  const success = render(React.createElement(AccountFlows, { view: 'verify', token: 'valid-local-token', email: 'shopper@example.test', onBack: () => {}, onVerified: (user) => { verifiedUser = user } }))
  await screen.findByRole('heading', { name: 'Email verified' })
  assert.equal(verifiedUser.email_verified, true)
  assert.equal(screen.queryByRole('button', { name: /Resend verification email/ }), null)
  success.unmount()

  mockFetch(() => json({ error: 'invalid token' }, 400))
  render(React.createElement(AccountFlows, { view: 'verify', token: 'invalid-local-token', email: 'shopper@example.test', onBack: () => {} }))
  await screen.findByRole('alert')
  assert.equal(screen.getByRole('button', { name: 'Resend verification email' }).disabled, false)
})

test('unverified restored accounts remain behind the verification gate', async () => {
  mockFetch(() => json({ user: { id: 'u1', email: 'shopper@example.test', email_verified: false, verification_required: true, preferred_currency: 'PHP' } }))
  render(React.createElement(App))

  await screen.findByRole('heading', { name: 'Check your email' })
  assert.equal(screen.queryByRole('navigation', { name: 'Main navigation' }), null)
  assert.equal(screen.queryByRole('heading', { name: 'Shopping list' }), null)
  assert.ok(screen.getByRole('button', { name: 'Resend verification email' }))
})

test('password reset into another unverified account returns to its verification gate', async () => {
  window.history.replaceState({}, '', '/#action=reset&token=local-reset-token')
  const { default: ResetApp } = await vite.ssrLoadModule('/src/App.jsx?scenario=reset-unverified')
  let sessionCalls = 0
  mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) {
      sessionCalls++
      return json({ user: sessionCalls === 1
        ? { id: 'u1', email: 'signed-in@example.test', email_verified: true, verification_required: false, preferred_currency: 'PHP' }
        : { id: 'u2', email: 'new-account@example.test', email_verified: false, verification_required: true, preferred_currency: 'PHP' } })
    }
    return json({ message: 'reset' })
  })
  render(React.createElement(ResetApp))

  await screen.findByRole('heading', { name: 'Reset password' })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-violet-password' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-violet-password' } })
  fireEvent.submit(screen.getByLabelText('New password').closest('form'))

  await screen.findByRole('heading', { name: 'Check your email' })
  assert.equal(screen.getByText('new-account@example.test').textContent, 'new-account@example.test')
  assert.equal(screen.queryByRole('navigation', { name: 'Main navigation' }), null)
  assert.ok(screen.getByRole('button', { name: 'Resend verification email' }))
})

test('password reset keeps confirmation local and reports success after a valid reset', async () => {
  const calls = mockFetch(() => json({ message: 'reset' }))
  render(React.createElement(AccountFlows, { view: 'reset', token: 'local-reset-token', onBack: () => {}, onReset: (token, password) => globalThis.fetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }) }))
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-violet-password' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'mismatch' } })
  fireEvent.submit(screen.getByLabelText('New password').closest('form'))
  assert.ok(screen.getAllByRole('alert').some((alert) => /Passwords do not match/.test(alert.textContent)))
  assert.equal(calls.length, 0)

  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-violet-password' } })
  fireEvent.submit(screen.getByLabelText('New password').closest('form'))
  await screen.findByRole('status')
  const resetBody = JSON.parse(calls[0].options.body)
  assert.deepEqual(resetBody, { token: 'local-reset-token', password: 'new-violet-password' })
  assert.equal(Object.hasOwn(resetBody, 'confirmation'), false)
})

test('change password validates confirmation locally and sends only current and new passwords', async () => {
  const calls = mockFetch(() => json({ message: 'updated' }))
  let changed = 0
  render(React.createElement(ChangePassword, { onChanged: () => { changed++ } }))
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-local-password' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-violet-password' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'mismatch' } })
  fireEvent.submit(screen.getByLabelText('Current password').closest('form'))
  assert.ok(screen.getAllByRole('alert').some((alert) => /Passwords do not match/.test(alert.textContent)))
  assert.equal(calls.length, 0)

  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-violet-password' } })
  fireEvent.submit(screen.getByLabelText('Current password').closest('form'))
  await waitFor(() => assert.equal(changed, 1))
  const body = JSON.parse(calls[0].options.body)
  assert.deepEqual(body, { currentPassword: 'old-local-password', newPassword: 'new-violet-password' })
  assert.equal(Object.hasOwn(body, 'confirmation'), false)
})
