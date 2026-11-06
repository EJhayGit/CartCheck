import { replaceListSummary } from './dataCache.js'
import { matchTier } from './findSuggestions.js'
import { mergePendingListResponse } from './purchaseMutations.js'

const REPLIES = {
  help: "I'm CartCheck's AI helper. I can create lists, add items, add to your catalog and check items off. You confirm everything first.",
  off_topic: 'I can only help with your CartCheck lists and catalog.',
  blocked: "I can't do that here. You can do it from the normal CartCheck screens.",
  unclear: "I didn't catch that. Try: Add eggs and rice to Weekly.",
  unusable: "I didn't catch that, and it didn't use a message. Try: Add eggs and rice to Weekly.",
}

export const assistantReply = (intent) => REPLIES[intent] ?? REPLIES.unclear

const shortTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The server owns the text but not the shopper's time zone, so the reset time is added here.
export function assistantErrorText(error, { now = Date.now(), formatTime = shortTime } = {}) {
  if (!error.retryAfter) return error.message
  const time = formatTime(new Date(now + error.retryAfter * 1000))
  if (error.code === 'ASSISTANT_DAILY_LIMIT') return `${error.message} They reset at ${time}.`
  if (error.code === 'ASSISTANT_APP_LIMIT') return `${error.message} Try again after ${time}.`
  return error.message
}

export function usedUpText(usage, { formatTime = shortTime } = {}) {
  return `You've used today's ${usage.limit} demo messages. They reset at ${formatTime(new Date(usage.resetsAt))}.`
}

export function itemLabel({ name, quantity, unitLabel }) {
  const amount = [quantity && Number(quantity), unitLabel].filter(Boolean).join(' ')
  return amount ? `${name} (${amount})` : name
}

export async function loadAllLists(api) {
  const lists = []
  let cursor = null
  do {
    const page = await api.getLists(cursor)
    lists.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return lists
}

const listIdOf = (list) => String(list.tripId ?? list.id)

function resolveList(listName, lists, currentListId) {
  const options = lists.map((list) => ({ id: listIdOf(list), name: list.name, itemCount: list.summary?.itemCount ?? 0, updatedAt: list.updatedAt }))
  if (listName !== undefined) {
    const key = listName.toLocaleLowerCase()
    const matches = options.filter((option) => option.name.toLocaleLowerCase() === key)
    if (matches.length === 1) return { listId: matches[0].id, options, notFound: null }
    if (matches.length > 1) return { listId: null, options: matches, notFound: null }
    return { listId: null, options, notFound: listName }
  }
  const open = options.some((option) => option.id === String(currentListId))
  return { listId: open ? String(currentListId) : null, options, notFound: null }
}

const shortDateTime = (date) => date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// List names may repeat, and identical picker entries would make the choice a guess.
export function listOptionLabel(option, options, { formatTime = shortDateTime } = {}) {
  const key = option.name.toLocaleLowerCase()
  if (options.filter((other) => other.name.toLocaleLowerCase() === key).length < 2) return option.name
  const count = option.itemCount === 1 ? '1 item' : `${option.itemCount} items`
  return `${option.name} (${count}, updated ${formatTime(new Date(option.updatedAt))})`
}

// Stricter than the find field: only exact or simple-plural matches reuse a catalog item.
const findProduct = (products, name) => products.find((product) => matchTier(product.name, name) === 0) ?? null
const withProducts = (items = [], products) => items.map((item) => ({ ...item, product: findProduct(products, item.name) }))

export function resolveProposal(actions, { lists, products, currentListId }) {
  return { steps: actions.map((action) => {
    if (action.type === 'create_list') return { ...action, items: withProducts(action.items, products) }
    if (action.type === 'add_items') return { ...action, list: resolveList(action.listName, lists, currentListId), items: withProducts(action.items, products) }
    if (action.type === 'add_catalog_items') return { ...action, items: withProducts(action.items, products) }
    return { ...action, list: resolveList(action.listName, lists, currentListId) }
  }) }
}

// Two equally close items are left unmatched, so the shopper never checks off the wrong one.
export function matchBought(itemNames, listDetail) {
  const match = { found: [], alreadyBought: [], missing: [] }
  for (const name of itemNames) {
    const ranked = listDetail.items
      .map((item) => ({ item, tier: matchTier(item.name, name) }))
      .filter(({ tier }) => tier >= 0)
      .sort((a, b) => a.tier - b.tier)
    if (!ranked.length || ranked[1]?.tier === ranked[0].tier) match.missing.push(name)
    else if (ranked[0].item.bought) match.alreadyBought.push(ranked[0].item.name)
    else match.found.push({ id: ranked[0].item.id, name: ranked[0].item.name })
  }
  return match
}

export function canConfirm({ steps }) {
  const listsChosen = steps.every((step) => !step.list || step.list.listId)
  const boughtLoaded = steps.every((step) => step.type !== 'mark_bought' || step.match)
  const somethingToSave = steps.some((step) => step.type !== 'mark_bought' || step.match?.found.length)
  return listsChosen && boughtLoaded && somethingToSave
}

async function saveToList(cache, listId, request) {
  const key = `list:${listId}`
  const release = cache.beginMutation(key)
  try {
    const result = await request()
    const list = mergePendingListResponse(cache, listId, result.list)
    cache.set(key, list)
    replaceListSummary(cache, list)
    return result
  } catch (error) {
    cache.invalidate(key)
    throw error
  } finally { release() }
}

// Each save runs once. A lost response on a create could otherwise make a duplicate.
export async function applyProposal({ steps }, { api, cache, preferredCurrency }) {
  const result = { saved: [], skipped: [], failed: [], listId: null }
  const madeHere = []
  let catalogChanged = false

  // A session change makes every later save wrong, so it stops the run.
  async function attempt(label, save) {
    try {
      await save()
      return true
    } catch (error) {
      if (error.name === 'AbortError') throw error
      result.failed.push(label)
      return false
    }
  }

  async function ensureProduct(item) {
    const known = item.product ?? findProduct(madeHere, item.name)
    if (known) return known
    catalogChanged = true
    const release = cache.beginMutation('catalog')
    try {
      const { item: created } = await api.createCatalogItem({ name: item.name, category: item.category ?? 'Other' })
      madeHere.push(created)
      return created
    } finally { release() }
  }

  async function addItems(listId, items) {
    for (const item of items) {
      let added
      const saved = await attempt(item.name, async () => {
        const product = await ensureProduct(item)
        added = await saveToList(cache, listId, () => api.addListItem(listId, product.id))
      })
      if (!saved) continue
      result.listId = listId
      if (!added.created) { result.skipped.push(item.name); continue }
      result.saved.push(item.name)
      const amount = {
        ...(item.quantity ? { quantity: item.quantity } : {}),
        ...(item.unitLabel ? { unitLabel: item.unitLabel } : {}),
      }
      if (Object.keys(amount).length) {
        await attempt(`Amount for ${item.name}`, () => saveToList(cache, listId, () => api.updateListItem(listId, added.item.id, amount)))
      }
    }
  }

  try {
    for (const step of steps) {
      if (step.type === 'create_list') {
        let listId = null
        await attempt(`List ${step.name}`, async () => {
          const list = await api.createList({ name: step.name, currency: preferredCurrency })
          listId = listIdOf(list)
          cache.set(`list:${listId}`, list)
          replaceListSummary(cache, list)
          result.saved.push(`List ${step.name}`)
          result.listId = listId
        })
        if (listId) await addItems(listId, step.items)
        else result.failed.push(...step.items.map((item) => item.name))
      } else if (step.type === 'add_items') {
        await addItems(step.list.listId, step.items)
      } else if (step.type === 'add_catalog_items') {
        for (const item of step.items) {
          if (item.product ?? findProduct(madeHere, item.name)) { result.skipped.push(item.name); continue }
          if (await attempt(item.name, () => ensureProduct(item))) result.saved.push(item.name)
        }
      } else {
        const { listId } = step.list
        for (const found of step.match.found) {
          if (await attempt(found.name, () => saveToList(cache, listId, () => api.updateListItem(listId, found.id, { bought: true })))) {
            result.saved.push(found.name)
            result.listId = listId
          }
        }
        result.skipped.push(...step.match.alreadyBought)
      }
    }
  } finally {
    if (catalogChanged) cache.invalidate('catalog')
  }
  return result
}
