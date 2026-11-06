import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantErrorBody, parseAssistantOutput, validateAssistantMessage } from './assistantValidation.js'

const reply = (value) => JSON.stringify(value)
const act = (...actions) => reply({ intent: 'act', actions })

test('a message is trimmed and limited to 300 characters', () => {
  assert.deepEqual(validateAssistantMessage({ message: '  add bread ' }), { message: 'add bread' })
  assert.deepEqual(validateAssistantMessage({ message: 'a'.repeat(300) }), { message: 'a'.repeat(300) })
  assert.ok(validateAssistantMessage({ message: 'a'.repeat(301) }).error)
})

test('emoji count as one character towards the limit', () => {
  assert.equal(validateAssistantMessage({ message: '🥚'.repeat(300) }).error, undefined)
})

test('a bad message body is refused', () => {
  for (const body of [undefined, null, [], {}, { message: 5 }, { message: '   ' }, { message: 'hi', extra: 1 }]) {
    assert.ok(validateAssistantMessage(body).error, JSON.stringify(body))
  }
})

test('every action shape is accepted', () => {
  const actions = [
    { type: 'create_list', name: 'Weekly' },
    { type: 'create_list', name: 'Party', items: [{ name: 'chips' }] },
    { type: 'add_items', listName: 'Weekly', items: [{ name: 'rice', quantity: '2', unitLabel: 'kg', category: 'Pantry' }] },
  ]
  assert.deepEqual(parseAssistantOutput(act(...actions)).actions[2].items[0], { name: 'rice', quantity: '2.000', unitLabel: 'kg', category: 'Pantry' })
  assert.equal(parseAssistantOutput(act({ type: 'add_items', items: [{ name: 'bread' }] })).actions[0].listName, undefined)
  assert.ok(parseAssistantOutput(act({ type: 'add_catalog_items', items: [{ name: 'oat milk' }] })))
  assert.deepEqual(parseAssistantOutput(act({ type: 'mark_bought', listName: 'Weekly', itemNames: ['eggs'] })).actions[0].itemNames, ['eggs'])
})

test('intents without actions are accepted', () => {
  for (const intent of ['help', 'off_topic', 'blocked', 'unclear']) {
    assert.deepEqual(parseAssistantOutput(reply({ intent, actions: [] })), { intent, actions: [] })
  }
})

test('any invalid part rejects the whole reply', () => {
  const item = { name: 'rice' }
  const bad = {
    'bad JSON': '{nope',
    'empty text': '',
    'not an object': '[]',
    'unknown top-level key': reply({ intent: 'help', actions: [], note: 'x' }),
    'unknown intent': reply({ intent: 'delete', actions: [] }),
    'missing actions': reply({ intent: 'help' }),
    'help with actions': reply({ intent: 'help', actions: [{ type: 'add_items', items: [item] }] }),
    'act with no actions': reply({ intent: 'act', actions: [] }),
    'unknown action': act({ type: 'delete_list', listName: 'Weekly' }),
    'four actions': act(...Array(4).fill({ type: 'add_items', items: [item] })),
    '31 items': act({ type: 'add_items', items: Array(31).fill(item) }),
    'no items': act({ type: 'add_items', items: [] }),
    'empty create items': act({ type: 'create_list', name: 'A', items: [] }),
    'price on an item': act({ type: 'add_items', items: [{ name: 'rice', estimatedTotal: '50.00' }] }),
    'price on an action': act({ type: 'add_items', items: [item], budget: '50.00' }),
    'wrong key for the action': act({ type: 'add_catalog_items', listName: 'Weekly', items: [item] }),
    'create_list using listName': act({ type: 'create_list', listName: 'Weekly' }),
    'list name too long': act({ type: 'create_list', name: 'a'.repeat(101) }),
    'empty listName': act({ type: 'add_items', listName: ' ', items: [item] }),
    'item name too long': act({ type: 'add_items', items: [{ name: 'a'.repeat(121) }] }),
    'empty item name': act({ type: 'add_items', items: [{ name: ' ' }] }),
    'bad quantity': act({ type: 'add_items', items: [{ name: 'rice', quantity: 'two' }] }),
    'unit too long': act({ type: 'add_items', items: [{ name: 'rice', unitLabel: 'a'.repeat(25) }] }),
    '31 item names': act({ type: 'mark_bought', itemNames: Array(31).fill('eggs') }),
    'non-string item name': act({ type: 'mark_bought', itemNames: [5] }),
    'empty item names': act({ type: 'mark_bought', itemNames: [] }),
  }
  for (const [name, text] of Object.entries(bad)) assert.equal(parseAssistantOutput(text), null, name)
})

test('an unknown category falls back to Other', () => {
  const result = parseAssistantOutput(act({ type: 'add_catalog_items', items: [{ name: 'calamansi', category: 'Citrus' }] }))
  assert.equal(result.actions[0].items[0].category, 'Other')
})

test('prototype keys cannot sneak past the key check', () => {
  assert.equal(parseAssistantOutput('{"intent":"help","actions":[],"__proto__":{"x":1}}'), null)
})

test('limit and unavailable errors share one standard body', () => {
  assert.deepEqual(assistantErrorBody('ASSISTANT_DAILY_LIMIT', { limit: 5 }), { error: "You've used today's 5 demo messages.", code: 'ASSISTANT_DAILY_LIMIT' })
  assert.deepEqual(assistantErrorBody('ASSISTANT_APP_LIMIT'), { error: 'The demo is full for today.', code: 'ASSISTANT_APP_LIMIT' })
  assert.deepEqual(assistantErrorBody('ASSISTANT_PROVIDER_LIMIT'), { error: 'The demo has hit its limit for now. Try again later.', code: 'ASSISTANT_PROVIDER_LIMIT' })
  assert.deepEqual(assistantErrorBody('ASSISTANT_UNAVAILABLE'), { error: "The assistant isn't available right now. You can still use CartCheck as usual.", code: 'ASSISTANT_UNAVAILABLE' })
})
