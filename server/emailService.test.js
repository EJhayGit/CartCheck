import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCOUNT_TOKEN_TTL_MINUTES } from './authSecurity.js'
import { createEmailService } from './emailService.js'

function withEmailEnvironment(callback) {
  const prior = {
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    mode: process.env.NODE_ENV,
  }
  process.env.RESEND_API_KEY = 'test-placeholder-key'
  process.env.EMAIL_FROM = 'CartCheck <no-reply@mail.example.test>'
  process.env.NODE_ENV = 'development'
  return Promise.resolve().then(callback).finally(() => {
    if (prior.key === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = prior.key
    if (prior.from === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = prior.from
    if (prior.mode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prior.mode
  })
}

test('development sink receives only message type when delivery is unconfigured', async () => {
  const priorKey = process.env.RESEND_API_KEY
  const priorFrom = process.env.EMAIL_FROM
  const priorMode = process.env.NODE_ENV
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  process.env.NODE_ENV = 'development'
  const captured = []
  try {
    const send = createEmailService({
      fetchImpl: () => { throw new Error('unexpected network call') },
      devSink: (kind) => { captured.push(kind) },
    })
    await send({ to: 'someone@example.test', kind: 'reset_password', actionUrl: 'https://example.test/#token=secret' })
    assert.deepEqual(captured, ['reset_password'])
  } finally {
    if (priorKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = priorKey
    if (priorFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = priorFrom
    if (priorMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = priorMode
  }
})

test('verification email includes accessible branded HTML and equivalent text', async () => {
  await withEmailEnvironment(async () => {
    let request
    const send = createEmailService({ fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true }
    } })
    const actionUrl = 'https://cartcheck.merzbuilds.dev/#action=verify&token=test-token'
    await send({ to: 'shopper@example.test', kind: 'verify_email', actionUrl })

    assert.equal(request.url, 'https://api.resend.com/emails')
    assert.equal(request.options.method, 'POST')
    const body = JSON.parse(request.options.body)
    assert.equal(body.from, 'CartCheck <no-reply@mail.example.test>')
    assert.deepEqual(body.to, ['shopper@example.test'])
    assert.equal(body.subject, 'Verify your CartCheck email')
    assert.match(body.html, /<html lang="en" dir="ltr">/)
    assert.match(body.html, /<title>Verify your CartCheck email<\/title>/)
    assert.match(body.html, /<h1[^>]*>Welcome to CartCheck!<\/h1>/)
    assert.match(body.html, /role="presentation"/)
    assert.match(body.html, /background-color:#176B45/)
    assert.match(body.html, /Verify Email Address<\/a>/)
    assert.equal(body.html.match(/href="https:\/\/cartcheck\.merzbuilds\.dev\/#action=verify&amp;token=test-token"/g)?.length, 2)
    assert.match(body.html, new RegExp(`This link expires in ${ACCOUNT_TOKEN_TTL_MINUTES} minutes\\.`))
    assert.match(body.text, /Welcome to CartCheck!/)
    assert.match(body.text, /Verify Email Address: https:\/\/cartcheck\.merzbuilds\.dev\/#action=verify&token=test-token/)
    assert.match(body.text, new RegExp(`This link expires in ${ACCOUNT_TOKEN_TTL_MINUTES} minutes\\.`))
    assert.match(body.html, /Didn't create an account\? You can safely ignore this email\./)
    assert.match(body.text, /Your grocery shopping companion\./)
  })
})

test('password reset email has matching action, expiry, and reassurance in both formats', async () => {
  await withEmailEnvironment(async () => {
    let body
    const send = createEmailService({ fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body)
      return { ok: true }
    } })
    const actionUrl = 'https://cartcheck.merzbuilds.dev/#action=reset&token=test-token'
    await send({ to: 'shopper@example.test', kind: 'reset_password', actionUrl })

    assert.equal(body.subject, 'Reset your CartCheck password')
    assert.match(body.html, /<h1[^>]*>Reset your password<\/h1>/)
    assert.match(body.html, /Reset Password<\/a>/)
    assert.equal(body.html.match(/href="https:\/\/cartcheck\.merzbuilds\.dev\/#action=reset&amp;token=test-token"/g)?.length, 2)
    assert.match(body.text, /Reset Password: https:\/\/cartcheck\.merzbuilds\.dev\/#action=reset&token=test-token/)
    assert.match(body.html, /existing password will remain unchanged unless the reset is completed/)
    assert.match(body.text, /existing password will remain unchanged unless the reset is completed/)
    assert.match(body.text, new RegExp(`This link expires in ${ACCOUNT_TOKEN_TTL_MINUTES} minutes\\.`))
    assert.doesNotMatch(body.html, /<img\b|<script\b/i)
  })
})

test('dynamic action URL is escaped in HTML and provider failures omit sensitive fields', async () => {
  await withEmailEnvironment(async () => {
    const actionUrl = 'https://example.test/?q="<tag>&x=\'secret'
    let body
    const send = createEmailService({ fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body)
      return { ok: false, status: 422 }
    } })
    await assert.rejects(
      send({ to: 'shopper@example.test', kind: 'verify_email', actionUrl }),
      (error) => error.message === 'Email provider returned 422'
        && !error.message.includes(actionUrl)
        && !error.message.includes('shopper@example.test')
        && !error.message.includes('test-placeholder-key')
    )
    assert.doesNotMatch(body.html, /<tag>/)
    assert.match(body.html, /href="https:\/\/example\.test\/\?q=&quot;&lt;tag&gt;&amp;x=&#39;secret"/)
    assert.match(body.text, /<tag>/)
  })
})
