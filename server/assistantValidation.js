import { validateItemChanges } from './cartValidation.js'
import { CATALOG_CATEGORIES } from './catalogValidation.js'
import { normalizeListName } from './listValidation.js'

const MESSAGE_MAX = 300
const ACTIONS_MAX = 3
const ENTRIES_MAX = 30
const INTENTS = ['act', 'help', 'off_topic', 'blocked', 'unclear']

export function assistantErrorBody(code, { limit } = {}) {
  const messages = {
    ASSISTANT_DAILY_LIMIT: `You've used today's ${limit} demo messages.`,
    ASSISTANT_APP_LIMIT: 'The demo is full for today.',
    ASSISTANT_PROVIDER_LIMIT: 'The demo has hit its limit for now. Try again later.',
    ASSISTANT_UNAVAILABLE: "The assistant isn't available right now. You can still use CartCheck as usual.",
  }
  return { error: messages[code], code }
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key))

export function validateAssistantMessage(body) {
  if (!isObject(body) || Object.keys(body).length !== 1 || typeof body.message !== 'string') return { error: 'Provide a message' }
  const message = body.message.trim()
  const length = [...message].length
  if (length < 1 || length > MESSAGE_MAX) return { error: `Message must be 1 to ${MESSAGE_MAX} characters` }
  return { message }
}

// Each parser returns the clean value, or null when anything is invalid.
function parseItem(raw) {
  if (!isObject(raw) || !onlyKeys(raw, ['name', 'quantity', 'unitLabel', 'category'])) return null
  const { category, ...fields } = raw
  const changes = validateItemChanges(fields)
  if (changes.error || !changes.name) return null
  if (category === undefined) return changes
  // A wrong suggestion shouldn't waste a message.
  return { ...changes, category: CATALOG_CATEGORIES.includes(category) ? category : 'Other' }
}

function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ENTRIES_MAX) return null
  const items = raw.map(parseItem)
  return items.includes(null) ? null : items
}

function parseItemNames(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ENTRIES_MAX) return null
  const names = raw.map((value) => (typeof value === 'string' ? validateItemChanges({ name: value }).name ?? null : null))
  return names.includes(null) ? null : names
}

// Optional keys stay absent, so the client can tell "no list named" apart.
function parseAction(raw) {
  if (!isObject(raw)) return null
  const listName = () => (raw.listName === undefined ? {} : normalizeListName(raw.listName) === null ? null : { listName: normalizeListName(raw.listName) })
  if (raw.type === 'create_list') {
    if (!onlyKeys(raw, ['type', 'name', 'items'])) return null
    const name = normalizeListName(raw.name)
    if (name === null) return null
    if (raw.items === undefined) return { type: raw.type, name }
    const items = parseItems(raw.items)
    return items && { type: raw.type, name, items }
  }
  if (raw.type === 'add_items') {
    if (!onlyKeys(raw, ['type', 'listName', 'items'])) return null
    const target = listName()
    const items = parseItems(raw.items)
    return target && items && { type: raw.type, ...target, items }
  }
  if (raw.type === 'add_catalog_items') {
    if (!onlyKeys(raw, ['type', 'items'])) return null
    const items = parseItems(raw.items)
    return items && { type: raw.type, items }
  }
  if (raw.type === 'mark_bought') {
    if (!onlyKeys(raw, ['type', 'listName', 'itemNames'])) return null
    const target = listName()
    const itemNames = parseItemNames(raw.itemNames)
    return target && itemNames && { type: raw.type, ...target, itemNames }
  }
  return null
}

export function parseAssistantOutput(text) {
  let output
  try { output = JSON.parse(text) } catch { return null }
  if (!isObject(output) || !onlyKeys(output, ['intent', 'actions'])) return null
  const { intent, actions: rawActions } = output
  if (!INTENTS.includes(intent) || !Array.isArray(rawActions)) return null
  if (intent === 'act' ? rawActions.length < 1 || rawActions.length > ACTIONS_MAX : rawActions.length) return null
  const actions = rawActions.map(parseAction)
  return actions.includes(null) ? null : { intent, actions }
}
