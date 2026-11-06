import assert from 'node:assert/strict'
import test from 'node:test'
import { withViewTransition } from './viewTransition.js'

const view = (reduce) => ({ matchMedia: () => ({ matches: reduce }) })

test('without the View Transitions API the update runs synchronously', async () => {
  let ran = 0
  const done = withViewTransition(() => { ran += 1 }, { defaultView: view(false) })
  assert.equal(ran, 1)
  await done
})

test('with the API the update runs inside startViewTransition and the promise waits for it', async () => {
  let ran = 0
  const doc = { defaultView: view(false), startViewTransition(callback) {
    return { updateCallbackDone: Promise.resolve().then(callback) }
  } }
  const done = withViewTransition(() => { ran += 1 }, doc)
  assert.equal(ran, 0)
  await done
  assert.equal(ran, 1)
})

test('reduced motion skips the transition', () => {
  let started = false
  let ran = 0
  withViewTransition(() => { ran += 1 }, { defaultView: view(true), startViewTransition() { started = true } })
  assert.equal(started, false)
  assert.equal(ran, 1)
})

test('no document at all still runs the update', () => {
  let ran = 0
  withViewTransition(() => { ran += 1 }, undefined)
  assert.equal(ran, 1)
})
