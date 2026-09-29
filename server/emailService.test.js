import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmailService } from './emailService.js'

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

test('Resend adapter sends text and escaped HTML through its fixed endpoint', async () => {
  const priorKey = process.env.RESEND_API_KEY
  const priorFrom = process.env.EMAIL_FROM
  const priorMode = process.env.NODE_ENV
  process.env.RESEND_API_KEY = 'test-placeholder-key'
  process.env.EMAIL_FROM = 'CartCheck <noreply@example.test>'
  process.env.NODE_ENV = 'development'
  let request
  try {
    const send = createEmailService({ fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true }
    } })
    await send({ to: 'shopper@example.test', kind: 'verify_email', actionUrl: 'https://example.test/#token=a&b' })
    assert.equal(request.url, 'https://api.resend.com/emails')
    assert.equal(request.options.method, 'POST')
    const body = JSON.parse(request.options.body)
    assert.deepEqual(body.to, ['shopper@example.test'])
    assert.match(body.text, /https:\/\/example\.test\/#token=a&b/)
    assert.match(body.html, /#token=a&amp;b/)
  } finally {
    if (priorKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = priorKey
    if (priorFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = priorFrom
    if (priorMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = priorMode
  }
})
