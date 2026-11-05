import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantConfig, interpretMessage } from './assistantModel.js'

const SECRET_MESSAGE = 'add my-private-item'
const ok = (text = '{"intent":"help","actions":[]}') => ({
  status: 200,
  ok: true,
  json: async () => ({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 267, candidatesTokenCount: 43, totalTokenCount: 310 },
  }),
})
const status = (code) => ({ status: code, ok: false, json: async () => ({ error: { message: 'google detail' } }) })

function setup(...responses) {
  const calls = []
  const waits = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { calls, waits, options: { apiKey: 'test-key', model: 'test-model', fetchImpl, wait: async (ms) => { waits.push(ms) } } }
}

function captureLogs(t) {
  const lines = []
  t.mock.method(console, 'log', (...args) => { lines.push(JSON.stringify(args)) })
  t.mock.method(console, 'error', (...args) => { lines.push(JSON.stringify(args)) })
  return lines
}

const timeoutError = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' })

test('the key goes in a header and never in the URL', async (t) => {
  captureLogs(t)
  const { calls, options } = setup(ok())
  await interpretMessage('add bread', options)
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-key')
  assert.ok(!calls[0].url.includes('test-key'))
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent')
})

test('the body holds only the message, the fixed prompt and the output settings', async (t) => {
  captureLogs(t)
  const { calls, options } = setup(ok())
  await interpretMessage('add bread', options)
  const body = JSON.parse(calls[0].options.body)
  assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'systemInstruction'])
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'add bread' }] }])
  assert.match(body.systemInstruction.parts[0].text, /^You convert commands for CartCheck/)
  assert.equal(body.generationConfig.responseMimeType, 'application/json')
  assert.equal(body.generationConfig.maxOutputTokens, 1000)
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' })
  assert.ok(!calls[0].options.body.includes('maxItems'))
})

test('a timeout signal is set on every attempt', async (t) => {
  captureLogs(t)
  const { calls, options } = setup(status(503), ok())
  await interpretMessage('add bread', options)
  assert.equal(calls.length, 2)
  for (const call of calls) assert.ok(call.options.signal instanceof AbortSignal)
})

test('the reply text is returned', async (t) => {
  captureLogs(t)
  const { options } = setup(ok('{"intent":"unclear","actions":[]}'))
  assert.equal(await interpretMessage('asdf', options), '{"intent":"unclear","actions":[]}')
})

test('a 503 retries once after 2 seconds', async (t) => {
  captureLogs(t)
  const { calls, waits, options } = setup(status(503), ok())
  await interpretMessage('add bread', options)
  assert.equal(calls.length, 2)
  assert.deepEqual(waits, [2000])
})

test('a timeout retries once', async (t) => {
  captureLogs(t)
  const { calls, options } = setup(timeoutError(), ok())
  await interpretMessage('add bread', options)
  assert.equal(calls.length, 2)
})

test('a second failure throws', async (t) => {
  captureLogs(t)
  for (const responses of [[status(503), status(503)], [timeoutError(), timeoutError()], [status(503), timeoutError()]]) {
    const { calls, options } = setup(...responses)
    await assert.rejects(interpretMessage('add bread', options))
    assert.equal(calls.length, 2)
  }
})

test("Google's 429 throws straight away and is marked as a limit", async (t) => {
  captureLogs(t)
  const { calls, waits, options } = setup(status(429))
  await assert.rejects(interpretMessage('add bread', options), (error) => error.code === 'provider_limit')
  assert.equal(calls.length, 1)
  assert.deepEqual(waits, [])
})

test('a 429 on the retry is still marked as a limit', async (t) => {
  captureLogs(t)
  const { options } = setup(status(503), status(429))
  await assert.rejects(interpretMessage('add bread', options), (error) => error.code === 'provider_limit')
})

test('a 500 or a network failure throws without a retry', async (t) => {
  captureLogs(t)
  for (const response of [status(500), new TypeError('fetch failed')]) {
    const { calls, options } = setup(response)
    await assert.rejects(interpretMessage('add bread', options), (error) => error.code !== 'provider_limit')
    assert.equal(calls.length, 1)
  }
})

test('a safety block or an empty reply throws', async (t) => {
  captureLogs(t)
  const empty = (payload) => ({ status: 200, ok: true, json: async () => payload })
  for (const payload of [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [] },
    { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"intent"' }] } }] },
  ]) {
    const { options } = setup(empty(payload))
    await assert.rejects(interpretMessage('add bread', options), JSON.stringify(payload))
  }
})

test('token counts are logged, and message text and replies never are', async (t) => {
  const lines = captureLogs(t)
  const { options } = setup(ok('{"secret-reply":true}'))
  await interpretMessage(SECRET_MESSAGE, options)
  const logged = lines.join('\n')
  assert.match(logged, /267/)
  assert.match(logged, /43/)
  assert.ok(!logged.includes(SECRET_MESSAGE))
  assert.ok(!logged.includes('secret-reply'))
})

test('thrown errors carry neither the message nor the key', async (t) => {
  captureLogs(t)
  const { options } = setup(status(500))
  await assert.rejects(interpretMessage(SECRET_MESSAGE, options), (error) => {
    assert.ok(!error.message.includes(SECRET_MESSAGE))
    assert.ok(!error.message.includes('test-key'))
    assert.ok(!error.message.includes('google detail'))
    return true
  })
})

test('an unreadable reply body throws without quoting it', async (t) => {
  captureLogs(t)
  const { options } = setup({ status: 200, ok: true, json: async () => JSON.parse('secret-reply') })
  await assert.rejects(interpretMessage('add bread', options), (error) => {
    assert.ok(!error.message.includes('secret-reply'))
    return true
  })
})

const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }

test('config defaults to 5 and 100', () => {
  assert.deepEqual(assistantConfig(env), { enabled: true, dailyLimit: 5, appLimit: 100, apiKey: 'k', model: 'm' })
})

test('config reads the limits', () => {
  const config = assistantConfig({ ...env, ASSISTANT_DAILY_LIMIT: '7', ASSISTANT_APP_DAILY_LIMIT: '50' })
  assert.equal(config.dailyLimit, 7)
  assert.equal(config.appLimit, 50)
})

test('a missing key or model turns the assistant off', () => {
  assert.equal(assistantConfig({ GEMINI_MODEL: 'm' }).enabled, false)
  assert.equal(assistantConfig({ GEMINI_API_KEY: 'k' }).enabled, false)
  assert.equal(assistantConfig({ ...env, GEMINI_API_KEY: '  ' }).enabled, false)
})

test('a limit that is not a positive integer turns the assistant off', () => {
  for (const bad of ['0', '-1', '1.5', 'five', '', ' ']) {
    assert.equal(assistantConfig({ ...env, ASSISTANT_DAILY_LIMIT: bad }).enabled, false, `daily ${bad}`)
    assert.equal(assistantConfig({ ...env, ASSISTANT_APP_DAILY_LIMIT: bad }).enabled, false, `app ${bad}`)
  }
})
