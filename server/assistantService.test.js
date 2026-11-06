import assert from 'node:assert/strict'
import test from 'node:test'
import { respondToMessage } from './assistantService.js'

const NOW = Date.parse('2026-11-06T07:00:00.000Z')
const resetsAt = '2026-11-06T08:00:00.000Z'
const config = { dailyLimit: 5, appLimit: 100, apiKey: 'k', model: 'm' }
const reserved = { usageDate: '2026-11-05', usage: { limit: 5, remaining: 2, resetsAt } }

function run({ reserve = async () => reserved, interpret = async () => '{"intent":"help","actions":[]}', refund } = {}) {
  const refunds = []
  const logs = []
  const deps = {
    reserve,
    interpret,
    refund: refund || (async (date) => { refunds.push(date) }),
    logError: (...args) => logs.push(args),
    now: () => NOW,
  }
  return respondToMessage('add bread', config, deps).then((result) => ({ result, refunds, logs }))
}

test('a usable reply returns the intent, actions and usage, and keeps the message', async () => {
  const { result, refunds } = await run()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { intent: 'help', actions: [], usage: reserved.usage })
  assert.deepEqual(refunds, [])
})

test('the account limit returns the standard message and seconds until reset', async () => {
  let called = false
  const { result } = await run({ reserve: async () => ({ error: 'daily_limit', resetsAt }), interpret: async () => { called = true } })
  assert.equal(result.status, 429)
  assert.deepEqual(result.body, { error: "You've used today's 5 demo messages.", code: 'ASSISTANT_DAILY_LIMIT' })
  assert.equal(result.retryAfter, 3600)
  assert.equal(called, false)
})

test('the app-wide cap returns its standard message and seconds until reset', async () => {
  const { result } = await run({ reserve: async () => ({ error: 'app_limit', resetsAt }) })
  assert.equal(result.status, 429)
  assert.equal(result.body.code, 'ASSISTANT_APP_LIMIT')
  assert.equal(result.retryAfter, 3600)
})

test("Google's limit refunds the account and gives no reset time", async () => {
  const { result, refunds } = await run({ interpret: async () => { throw Object.assign(new Error('x'), { code: 'provider_limit' }) } })
  assert.equal(result.status, 429)
  assert.deepEqual(result.body, { error: 'The demo has hit its limit for now. Try again later.', code: 'ASSISTANT_PROVIDER_LIMIT' })
  assert.equal(result.retryAfter, undefined)
  assert.deepEqual(refunds, ['2026-11-05'])
})

test('a Gemini failure refunds the reserved date and returns unavailable', async () => {
  const { result, refunds } = await run({ interpret: async () => { throw new Error('timeout') } })
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'ASSISTANT_UNAVAILABLE')
  assert.deepEqual(refunds, ['2026-11-05'])
})

test('an unusable reply refunds, and reports the message as not used', async () => {
  const { result, refunds } = await run({ interpret: async () => '{"intent":"act","actions":[{"type":"delete"}]}' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { intent: 'unusable', actions: [], usage: { ...reserved.usage, remaining: 3 } })
  assert.deepEqual(refunds, ['2026-11-05'])
})

test('a failed refund is logged without message text and does not change the answer', async () => {
  const { result, logs } = await run({ interpret: async () => { throw new Error('timeout') }, refund: async () => { throw new Error('db down') } })
  assert.equal(result.status, 503)
  assert.deepEqual(logs, [['timeout'], ['Assistant refund failed']])
  assert.ok(!JSON.stringify(logs).includes('add bread'))
})

test('a Gemini failure is logged by its safe status so the owner can troubleshoot', async () => {
  const { logs } = await run({ interpret: async () => { throw new Error('Assistant model call failed: 404') } })
  assert.deepEqual(logs, [['Assistant model call failed: 404']])
})
