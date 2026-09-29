import test from 'node:test'
import assert from 'node:assert/strict'
import { resetAndRevalidate } from './resetSession.js'

const unauthorized = () => Object.assign(new Error('Authentication required'), { status: 401 })

test('resetting another account preserves the signed-in account returned by the server', async () => {
  const userA = { id: '1', email: 'a@example.test' }
  let generation = 4
  const outcome = await resetAndRevalidate({
    resetPassword: async () => {},
    getSession: async () => ({ user: userA }),
    getGeneration: () => generation,
  })
  assert.deepEqual(outcome, { status: 'authenticated', user: userA, generation: 4 })
  assert.equal(generation, 4)
})

test('resetting the signed-in account recognizes server-side session revocation', async () => {
  const outcome = await resetAndRevalidate({
    resetPassword: async () => {},
    getSession: async () => { throw unauthorized() },
    getGeneration: () => 2,
  })
  assert.deepEqual(outcome, { status: 'unauthenticated', generation: 2 })
})

test('resetting while unauthenticated does not create a session', async () => {
  const outcome = await resetAndRevalidate({
    resetPassword: async () => {},
    getSession: async () => { throw unauthorized() },
    getGeneration: () => 0,
  })
  assert.deepEqual(outcome, { status: 'unauthenticated', generation: 0 })
})

test('failed reset does not revalidate or change the previous authentication state', async () => {
  const failure = Object.assign(new Error('Invalid reset link'), { status: 400 })
  let sessionChecks = 0
  let confirmedResets = 0
  await assert.rejects(resetAndRevalidate({
    resetPassword: async () => { throw failure },
    getSession: async () => { sessionChecks++; return { user: { id: '1' } } },
    getGeneration: () => 1,
    onResetSucceeded: () => { confirmedResets++ },
  }), (error) => error === failure)
  assert.equal(sessionChecks, 0)
  assert.equal(confirmedResets, 0)
})

test('a temporary session check failure remains unknown, not signed out', async () => {
  const outcome = await resetAndRevalidate({
    resetPassword: async () => {},
    getSession: async () => { throw new Error('Network unavailable') },
    getGeneration: () => 1,
  })
  assert.deepEqual(outcome, { status: 'unknown', generation: 1 })
})

test('a stale session response is ignored after an account switch and rechecked', async () => {
  let generation = 1
  let resolveFirst
  const first = new Promise((resolve) => { resolveFirst = resolve })
  const userA = { id: '1' }
  const userB = { id: '2' }
  let calls = 0
  const pending = resetAndRevalidate({
    resetPassword: async () => {},
    getSession: () => ++calls === 1 ? first : Promise.resolve({ user: userB }),
    getGeneration: () => generation,
  })
  await Promise.resolve()
  generation = 2
  resolveFirst({ user: userA })
  assert.deepEqual(await pending, { status: 'authenticated', user: userB, generation: 2 })
  assert.equal(calls, 2)
})

test('repeated concurrent auth changes leave session status unknown', async () => {
  let generation = 0
  const outcome = await resetAndRevalidate({
    resetPassword: async () => {},
    getSession: async () => { generation++; return { user: { id: String(generation) } } },
    getGeneration: () => generation,
  })
  assert.deepEqual(outcome, { status: 'unknown', generation: 3 })
})
