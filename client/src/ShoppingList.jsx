import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteListItem, finishTrip, getCatalog, getList, getTrip, getTrips, updateList, updateListItem } from './api/httpApi.js'
import { formatQuantity, getShoppingProgress, sortShoppingItems } from './shoppingProgress.js'
import { budgetProgress, formatMoney, moneySummary, normalizeMoney } from './money.js'
import { createPurchaseMutations, mergePendingListResponse } from './purchaseMutations.js'
import { useDataCache, useDataQuery } from './dataCache.jsx'
import { cacheCompletedTrip, removeListSummary, replaceListSummary } from './dataCache.js'
import { Tick } from './Brand.jsx'

const EMPTY_FORM = { name: '', quantity: '1', unitLabel: '', estimatedTotal: '', actualTotal: '' }
const VIEW_KEY = 'cartcheck:list-view'
const SORT_MODES = ['default', 'az', 'category']

function formFor(item) {
  return { name: item.name, quantity: formatQuantity({ quantity: item.quantity }), unitLabel: item.unitLabel || '', estimatedTotal: item.estimatedTotal ?? '', actualTotal: item.actualTotal ?? '' }
}

// Sort and hide-bought are a per-browser convenience; the list works without storage.
function readView() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEW_KEY)) || {}
    return { sortMode: SORT_MODES.includes(saved.sortMode) ? saved.sortMode : 'default', hidePurchased: saved.hidePurchased === true }
  } catch { return { sortMode: 'default', hidePurchased: false } }
}

function priceNote(item, currency) {
  const parts = []
  if (item.estimatedTotal != null) parts.push(`est. ${formatMoney(item.estimatedTotal, currency)}`)
  if (item.actualTotal != null) parts.push(`paid ${formatMoney(item.actualTotal, currency)}`)
  return parts.join(' · ')
}

function ReviewRows({ items, currency }) {
  if (!items.length) return <p className="optional-help">No items in this group.</p>
  return <ul className="trip-review-list">{items.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{formatQuantity(item)}{priceNote(item, currency) ? ` · ${priceNote(item, currency)}` : ''}</small></span></li>)}</ul>
}

function BudgetMeter({ budget, summary, currency, label }) {
  const progress = budgetProgress(budget, summary)
  if (!progress) return null
  const status = progress.reached ? 'Budget reached' : `${formatMoney(progress.value, currency)} ${progress.over ? 'over budget' : 'remaining'}`
  return <div className="budget-meter">
    <p className="budget-meter-label">{label}</p>
    <p className="budget-meter-amount">{formatMoney(summary.total, currency)} <span>/ {formatMoney(budget, currency)}</span></p>
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${status}${progress.incomplete ? '; known prices only, incomplete' : ''}`}><span style={{ width: `${progress.percent}%` }} /></div>
    <p className={progress.over ? 'budget-warning' : 'budget-comparison'}>{status}{progress.incomplete ? ' · known prices only; incomplete' : ''}</p>
  </div>
}

export default function ShoppingList({ listId, active = true, editItem, onEditHandled, onBrowseCatalog, onBackToLists, onQuickAdd, onMutationPending, onReviewChange }) {
  const cache = useDataCache()
  const cacheKey = `list:${listId}`
  const fetchList = (signal) => getList(listId, { signal })
  const [reviewing, setReviewing] = useState(false)
  const cartQuery = useDataQuery(cacheKey, fetchList, { enabled: active && !reviewing })
  const knownName = cache.get('lists').data?.items?.find((list) => String(list.id) === String(listId))?.name
  const { items = [], currency = 'PHP', tripId = listId, revision = null, budget = null, name = knownName || 'Your list' } = cartQuery.data || {}
  const loading = cartQuery.loading
  const error = cartQuery.error ? 'We could not refresh your shopping list. Check your connection and try again.' : ''
  const hasCart = cartQuery.data !== undefined
  function setItems(value) {
    cache.set(cacheKey, (current) => current && { ...current, items: typeof value === 'function' ? value(current.items) : value })
    replaceListSummary(cache, cache.get(cacheKey).data)
  }
  function setBudget(value) { cache.set(cacheKey, (current) => current && { ...current, budget: value }) }
  const [finishBusy, setFinishBusy] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [finishError, setFinishError] = useState('')
  const reviewRef = useRef(null)
  const reviewSurfaceRef = useRef(null)
  const mounted = useRef(false)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [budgetEditing, setBudgetEditing] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [notice, setNotice] = useState('')
  const [announcement, setAnnouncement] = useState('')
  // Checked rows stay in To buy briefly so the tick is seen where the thumb is; ids settle into Bought.
  const [settling, setSettling] = useState(() => new Set())
  const settleTimers = useRef(new Map())
  const rowsRef = useRef([])
  const [lastChange, setLastChange] = useState(null)
  const [moreFields, setMoreFields] = useState(false)
  const [actionError, setActionError] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyItemId, setBusyItemId] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [view, setView] = useState(readView)
  const { sortMode, hidePurchased } = view
  const [query, setQuery] = useState('')
  const [addingProductId, setAddingProductId] = useState(null)
  const [purchasePending, setPurchasePending] = useState(0)
  const catalogQuery = useDataQuery('catalog', (signal) => getCatalog({ signal }), { staleTime: Infinity, enabled: active && query.trim() !== '' })
  // Items from the most recent finished trip are suggested first; that is what a weekly shopper re-adds.
  const tripsQuery = useDataQuery('trips', (signal) => getTrips(null, { signal }), { staleTime: 30000, enabled: active && query.trim() !== '' })
  const lastTripId = tripsQuery.data?.items?.[0]?.id ?? null
  const lastTripQuery = useDataQuery(lastTripId ? `trip:${lastTripId}` : 'trip:none', (signal) => getTrip(lastTripId, { signal }), { staleTime: Infinity, enabled: active && query.trim() !== '' && lastTripId !== null })
  const purchases = useMemo(() => createPurchaseMutations(cache, (itemId, input) => updateListItem(listId, itemId, input), {
    onPending: (count) => { setPurchasePending(count); onMutationPending(Boolean(count || pendingMutation.current)) }, onError: setActionError, listId,
  }), [cache, listId])
  useEffect(() => purchases.subscribe(), [purchases])
  const pendingMutation = useRef(false)
  const editorVersion = useRef(0)
  // An element id to focus after the next render, used when an element moves or disappears.
  const focusTarget = useRef(null)
  useEffect(() => {
    if (!focusTarget.current) return
    const target = document.getElementById(focusTarget.current)
    if (target) { focusTarget.current = null; target.focus() }
  })
  useEffect(() => {
    mounted.current = true
    const timers = settleTimers.current
    return () => { mounted.current = false; for (const timer of timers.values()) clearTimeout(timer) }
  }, [])
  useEffect(() => {
    if (!lastChange) return
    const timer = setTimeout(() => setLastChange(null), 6000)
    return () => clearTimeout(timer)
  }, [lastChange])
  function reportPending() { onMutationPending(Boolean(pendingMutation.current || purchases.size)) }
  function updateView(changes) {
    setView((current) => {
      const next = { ...current, ...changes }
      try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(next)) } catch { /* Storage is optional. */ }
      return next
    })
  }

  useEffect(() => { onReviewChange(reviewing) }, [reviewing, onReviewChange])
  useEffect(() => () => { onReviewChange(false); onMutationPending(false) }, [])

  useEffect(() => {
    if (!editItem) return
    editorVersion.current += 1
    setItems((current) => current.some((item) => item.id === editItem.id)
      ? current.map((item) => item.id === editItem.id ? editItem : item)
      : [...current, editItem])
    // An item re-added from the catalog may be hidden by the current filters.
    setQuery('')
    if (editItem.bought) updateView({ hidePurchased: false })
    setEditor({ id: editItem.id })
    setForm(formFor(editItem))
    setFormError('')
    setConfirmRemove(false); setMoreFields(true)
    setActionError('')
    onEditHandled()
  }, [editItem, onEditHandled])

  useEffect(() => { if (!budgetEditing) setBudgetDraft(budget ?? '') }, [budget, budgetEditing])
  // Freeze the exact reviewed snapshot and revision until confirmation is closed.
  useEffect(() => { if (reviewing) return cache.beginMutation(cacheKey) }, [cache, cacheKey, reviewing])

  useEffect(() => {
    if (!reviewing) return
    reviewRef.current?.focus()
    function handleReviewKey(event) {
      if (event.key === 'Escape' && !finishBusy) {
        setReviewing(false)
        setFinishError('')
        focusTarget.current = 'finish-shopping'
      }
      if (event.key !== 'Tab') return
      const controls = [...reviewSurfaceRef.current.querySelectorAll('button:not(:disabled), summary')]
      if (!controls.length) { event.preventDefault(); reviewRef.current?.focus(); return }
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === reviewRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleReviewKey)
    return () => document.removeEventListener('keydown', handleReviewKey)
  }, [reviewing, finishBusy])

  async function confirmFinish() {
    if (pendingMutation.current || purchases.size || finishBusy || !tripId) return
    pendingMutation.current = true
    const release = cache.beginMutation(cacheKey)
    reportPending()
    setFinishBusy(true)
    setFinishError('')
    try {
      const result = await finishTrip(tripId, revision)
      if (!cache.alive) return
      const completedTrip = result.completedTrip
      cache.set(cacheKey, undefined)
      removeListSummary(cache, listId)
      cacheCompletedTrip(cache, completedTrip)
      if (!mounted.current) return
      setEditor(null)
      setReviewing(false)
      // This screen unmounts on navigation, so My Lists shows the confirmation.
      onBackToLists?.({ notice: `${name} is saved in Trips.`, tripId: completedTrip?.id ?? tripId })
    } catch (caught) {
      setFinishError(caught.status === 409
        ? 'This trip changed since you opened the review. Return to your list and review it again.'
        : caught.status ? (caught.message || 'We could not finish this trip. Please try again.')
          : 'Connection lost. We could not confirm whether the trip was saved. Try confirming again when connected; it will not create a duplicate trip.')
    } finally {
      release()
      pendingMutation.current = false
      if (mounted.current) { reportPending(); setFinishBusy(false) }
    }
  }

  async function openReview() {
    if (pendingMutation.current || purchases.size || reviewBusy) return
    pendingMutation.current = true
    reportPending()
    setReviewBusy(true)
    setActionError('')
    try {
      const current = await cache.load(cacheKey, fetchList, { force: true })
      setBudgetDraft(current.budget ?? '')
      if (!current.items.length) return
      setFinishError('')
      setReviewing(true)
    } catch (caught) { setActionError(caught.message || 'Could not load the current trip for review.') }
    finally { pendingMutation.current = false; reportPending(); setReviewBusy(false) }
  }

  function openEdit(item) {
    if (editor?.id === item.id) { closeEditor(); return }
    editorVersion.current += 1
    setEditor({ id: item.id })
    setForm(formFor(item))
    setFormError('')
    setConfirmRemove(false); setMoreFields(false)
    setActionError('')
    setNotice('')
  }

  function closeEditor() {
    if (busy) return
    if (editor) focusTarget.current = `edit-${editor.id}`
    setEditor(null)
    setFormError('')
    setConfirmRemove(false)
  }

  async function save(event) {
    event.preventDefault()
    if (pendingMutation.current) return
    const trimmedName = form.name.trim()
    const rawQuantity = form.quantity.trim()
    const validQuantity = /^(?:\d+)(?:\.\d{1,3})?$/.test(rawQuantity) && Number(rawQuantity) > 0
    if (!trimmedName) { setFormError('Enter an item name.'); return }
    if (!validQuantity) { setFormError('Enter a quantity greater than zero, with up to three decimal places.'); return }
    let estimatedTotal, actualTotal
    try {
      estimatedTotal = normalizeMoney(form.estimatedTotal)
      actualTotal = normalizeMoney(form.actualTotal)
    } catch (caught) { setFormError(caught.message); return }
    const itemId = editor.id
    if (purchases.has(itemId)) { setFormError('Wait for this item’s purchase change to save, then try again.'); return }
    const versionAtSave = editorVersion.current
    const previous = items.find((item) => item.id === itemId)
    if (!previous) { setFormError('This item is no longer in your list. Try again.'); return }
    pendingMutation.current = true
    const release = cache.beginMutation(cacheKey)
    reportPending()
    setBusy(true)
    setBusyItemId(itemId)
    setBusyAction('save')
    setFormError('')
    setActionError('')
    setItems((current) => current.map((item) => item.id === itemId
      ? { ...item, name: trimmedName, quantity: rawQuantity, unitLabel: form.unitLabel.trim() || null, estimatedTotal, actualTotal }
      : item))
    focusTarget.current = `edit-${itemId}`
    setEditor(null)
    try {
      const result = await updateListItem(listId, itemId, {
        name: trimmedName,
        quantity: rawQuantity,
        unitLabel: form.unitLabel.trim(),
        estimatedTotal,
        actualTotal,
      })
      const serverList = mergePendingListResponse(cache, listId, result.list)
      cache.set(cacheKey, serverList)
      replaceListSummary(cache, serverList)
      setNotice(`${trimmedName} saved.`)
    } catch (caught) {
      setItems((current) => current.map((item) => item.id === itemId ? previous : item))
      cache.invalidate(cacheKey)
      if (editorVersion.current === versionAtSave) {
        setEditor({ id: itemId })
        setFormError(caught.message || 'We could not save this item. Please try again.')
      } else setActionError(caught.message || 'We could not save this item. Please try again.')
    } finally { release(); pendingMutation.current = false; reportPending(); setBusy(false); setBusyItemId(null); setBusyAction('') }
  }

  async function saveBudget(event) {
    event.preventDefault()
    if (pendingMutation.current) return
    let nextBudget
    try { nextBudget = normalizeMoney(budgetDraft) }
    catch (caught) { setBudgetError(caught.message); return }
    const previous = budget
    pendingMutation.current = true
    const release = cache.beginMutation(cacheKey)
    reportPending()
    setBusy(true)
    setBudgetError('')
    setActionError('')
    setNotice('')
    setBudget(nextBudget)
    setBudgetEditing(false)
    try {
      const result = await updateList(listId, { budget: nextBudget })
      const serverList = mergePendingListResponse(cache, listId, result)
      cache.set(cacheKey, serverList)
      replaceListSummary(cache, serverList)
      setBudget(result.budget)
      setBudgetDraft(result.budget ?? '')
      setNotice(nextBudget === null ? 'Budget removed.' : 'Budget saved.')
    } catch (caught) {
      setBudget(previous)
      cache.invalidate(cacheKey)
      setBudgetDraft(nextBudget ?? '')
      setBudgetEditing(true)
      setBudgetError(caught.message || 'We could not save your budget. Please try again.')
    } finally { release(); pendingMutation.current = false; reportPending(); setBusy(false) }
  }

  async function remove(item) {
    if (pendingMutation.current || purchases.has(item.id)) return
    const previousIndex = items.findIndex((entry) => entry.id === item.id)
    const neighbor = rowOrder.at(rowOrder.findIndex((entry) => entry.id === item.id) + 1) || rowOrder.at(-2)
    pendingMutation.current = true
    const release = cache.beginMutation(cacheKey)
    reportPending()
    setBusy(true)
    setBusyItemId(item.id)
    setBusyAction('remove')
    setActionError('')
    setNotice('')
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    setEditor(null)
    setConfirmRemove(false)
    focusTarget.current = neighbor && neighbor.id !== item.id ? `edit-${neighbor.id}` : 'find-item'
    try {
      const result = await deleteListItem(listId, item.id)
      const serverList = mergePendingListResponse(cache, listId, result.list)
      cache.set(cacheKey, serverList)
      replaceListSummary(cache, serverList)
      setNotice(`${item.name} removed.`)
    } catch (caught) {
      setItems((current) => {
        if (current.some((entry) => entry.id === item.id)) return current
        const restored = [...current]
        restored.splice(Math.min(previousIndex, restored.length), 0, item)
        return restored
      })
      cache.invalidate(cacheKey)
      setActionError(caught.message || 'We could not remove this item. Please try again.')
    } finally { release(); pendingMutation.current = false; reportPending(); setBusy(false); setBusyItemId(null); setBusyAction('') }
  }

  function stopSettling(id) {
    clearTimeout(settleTimers.current.get(id))
    settleTimers.current.delete(id)
    setSettling((current) => { if (!current.has(id)) return current; const next = new Set(current); next.delete(id); return next })
  }

  function settle(id) {
    // The row is about to move to Bought; keep keyboard focus on the next item still to buy.
    if (document.activeElement?.id === `check-${id}`) {
      const rows = rowsRef.current
      const position = rows.findIndex((entry) => entry.id === id)
      const next = rows.slice(position + 1).find((entry) => !entry.bought) || rows.slice(0, position).reverse().find((entry) => !entry.bought)
      focusTarget.current = next ? `check-${next.id}` : 'finish-from-list'
    }
    stopSettling(id)
  }

  function setBought(item, bought) {
    if (pendingMutation.current || reviewBusy) return
    setActionError('')
    setNotice('')
    stopSettling(item.id)
    if (bought && sortMode === 'default') {
      setSettling((current) => new Set(current).add(item.id))
      settleTimers.current.set(item.id, setTimeout(() => settle(item.id), 1500))
    } else if (sortMode === 'default' && document.activeElement?.id === `check-${item.id}`) focusTarget.current = `check-${item.id}`
    const left = remainingCount + (bought ? -1 : 1)
    setLastChange({ item, bought, text: `${item.name} ${bought ? 'bought' : 'moved back to To buy'}. ${left} left.` })
    purchases.set(item.id, bought)
  }

  function undoLastChange() {
    if (!lastChange) return
    const { item, bought } = lastChange
    stopSettling(item.id)
    focusTarget.current = `check-${item.id}`
    setLastChange({ item, bought: !bought, undone: true, text: `${item.name} ${bought ? 'moved back to To buy' : 'bought'}.` })
    purchases.set(item.id, !bought)
  }

  async function quickAdd(product) {
    if (addingProductId || !onQuickAdd) return
    setAddingProductId(product.id)
    setActionError('')
    setNotice('')
    try {
      await onQuickAdd(product.id)
      setQuery('')
      setAnnouncement(`${product.name} added.`)
      focusTarget.current = 'find-item'
    } catch (caught) { setActionError(`We could not add ${product.name}. ${caught.message || 'Please try again.'}`) }
    finally { setAddingProductId(null) }
  }

  const { purchasedCount, remainingCount, visibleItems: unfilteredVisible } = getShoppingProgress(items, hidePurchased)
  const term = query.trim().toLocaleLowerCase()
  const visibleItems = term ? unfilteredVisible.filter((item) => item.name.toLocaleLowerCase().includes(term)) : unfilteredVisible
  const sortedItems = sortShoppingItems(visibleItems, sortMode)
  const remainingItems = visibleItems.filter((item) => item.bought !== true || settling.has(item.id))
  const purchasedItems = visibleItems.filter((item) => item.bought === true && !settling.has(item.id))
  rowsRef.current = remainingItems
  const rowOrder = sortMode === 'default' ? [...remainingItems, ...purchasedItems] : sortedItems
  const progressPercent = items.length ? (purchasedCount / items.length) * 100 : 0
  const spending = moneySummary(items)
  const overBudget = budgetProgress(budget, spending.actual)?.over || budgetProgress(budget, spending.estimated)?.over
  const budgetLine = [
    budget === null ? 'No budget' : `Budget ${formatMoney(budget, currency)}`,
    spending.estimated.knownCount ? `est. ${formatMoney(spending.estimated.total, currency)}${spending.estimated.missingCount ? ` (${spending.estimated.missingCount} unpriced)` : ''}` : 'no prices yet',
    overBudget ? 'over budget' : '',
  ].filter(Boolean).join(' · ')
  const onList = new Set(items.map((item) => String(item.productId)))
  const catalogItems = Array.isArray(catalogQuery.data) ? catalogQuery.data : catalogQuery.data?.items || []
  const boughtBefore = new Set((lastTripQuery.data?.trip?.items || []).map((entry) => String(entry.productId)))
  const suggestions = term ? catalogItems.filter((product) => !onList.has(String(product.id)) && product.name.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(boughtBefore.has(String(b.id))) - Number(boughtBefore.has(String(a.id)))).slice(0, 5) : []

  if (reviewing) return <main className="shopping-main trip-screen" aria-labelledby="finish-title" ref={reviewSurfaceRef}>
    <div className="shopping-heading"><div><h1 id="finish-title" ref={reviewRef} tabIndex="-1">Finish shopping?</h1><p className="catalog-subtitle">Check “{name}” before saving it to Trips. The menu is paused until you keep shopping or confirm.</p></div><span className="currency-label">{currency}</span></div>
    <section className="catalog-panel review-summary" aria-label="What will be saved">
      <p className="review-fact"><strong>{purchasedCount} bought</strong>{remainingCount > 0 ? <> · <strong>{remainingCount} will be saved as not bought</strong></> : ' · nothing left unchecked'}</p>
      <p className="review-spend">Recorded spending: <strong>{spending.actual.knownCount ? formatMoney(spending.actual.total, currency) : 'none recorded'}</strong>{spending.actual.missingCount ? ` · ${spending.actual.missingCount} bought item${spending.actual.missingCount === 1 ? ' has' : 's have'} no actual price` : ''}</p>
      <p className="optional-help">{spending.actual.knownCount ? '' : 'You can finish without recording prices. '}{budget !== null ? `Budget ${formatMoney(budget, currency)}; going over it does not prevent finishing. ` : ''}Other active lists stay as they are.</p>
      {finishError && <p className="alert" role="alert">{finishError}</p>}
      <div className="trip-actions review-actions"><button className="catalog-button secondary" type="button" onClick={() => { setReviewing(false); setFinishError(''); if (finishError) cache.invalidate(cacheKey); focusTarget.current = 'finish-shopping' }} disabled={finishBusy}>Keep shopping</button><button className="catalog-button primary" type="button" onClick={confirmFinish} disabled={finishBusy}>{finishBusy ? 'Saving trip…' : 'Confirm and finish'}</button></div>
    </section>
    {remainingCount > 0 && <details className="catalog-panel review-group" open><summary><h2>Not bought <span className="section-count">{remainingCount}</span></h2></summary><ReviewRows items={items.filter((item) => !item.bought)} currency={currency} /></details>}
    {purchasedCount > 0 && <details className="catalog-panel review-group"><summary><h2>Bought <span className="section-count">{purchasedCount}</span></h2></summary><ReviewRows items={items.filter((item) => item.bought)} currency={currency} /></details>}
  </main>

  function renderEditor(item) {
    const removing = busy && busyItemId === item.id && busyAction === 'remove'
    const actualField = <div><label htmlFor="list-item-actual">{item.bought && !moreFields ? `Paid (${currency}, optional)` : `Actual total (${currency}, optional)`}</label><input id="list-item-actual" inputMode="decimal" value={form.actualTotal} onChange={(event) => setForm({ ...form, actualTotal: event.target.value })} placeholder="Unknown" aria-describedby="item-price-help" autoFocus={item.bought && !moreFields} /></div>
    const saveActions = <span className="row-editor-save"><button className="catalog-button secondary" type="button" onClick={closeEditor} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy && busyAction === 'save' ? 'Saving…' : 'Save'}</button></span>
    // A bought item is usually opened to record what was paid, so that field comes first.
    if (item.bought && !moreFields) return <form className="row-editor catalog-form" onSubmit={save} aria-label={`Edit ${item.name}`} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeEditor() } }}>
      {actualField}
      <p id="item-price-help" className="optional-help">The total for this line. Leave blank if unknown; enter 0 for a free item.</p>
      {formError && <p className="alert" role="alert">{formError}</p>}
      <div className="row-editor-actions"><button className="text-button" type="button" onClick={() => setMoreFields(true)}>More details</button>{saveActions}</div>
    </form>
    return <form className="row-editor catalog-form" onSubmit={save} aria-label={`Edit ${item.name}`} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeEditor() } }}>
      <div className="quantity-fields"><div><label htmlFor="list-item-quantity">Quantity</label><input id="list-item-quantity" inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} onFocus={(event) => event.target.select()} maxLength={20} required autoFocus /></div><div><label htmlFor="list-item-unit">Unit (optional)</label><input id="list-item-unit" value={form.unitLabel} onChange={(event) => setForm({ ...form, unitLabel: event.target.value })} maxLength={24} placeholder="kg, L, packs" /></div></div>
      <label htmlFor="list-item-name">Name on this list</label><input id="list-item-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required />
      <div className="quantity-fields"><div><label htmlFor="list-item-estimate">Estimated total ({currency}, optional)</label><input id="list-item-estimate" inputMode="decimal" value={form.estimatedTotal} onChange={(event) => setForm({ ...form, estimatedTotal: event.target.value })} placeholder="Unknown" aria-describedby="item-price-help" /></div>{actualField}</div>
      <p id="item-price-help" className="optional-help">Leave blank if unknown; enter 0 for a free item. Quantity does not multiply these amounts.</p>
      {formError && <p className="alert" role="alert">{formError}</p>}
      <div className="row-editor-actions">
        {confirmRemove
          ? <p className="remove-confirm" role="group" aria-label={`Remove ${item.name}?`}><span>Remove from this list?</span><button className="catalog-small-button" type="button" onClick={() => { setConfirmRemove(false); focusTarget.current = 'remove-item' }} disabled={busy}>Keep</button><button id="confirm-remove" className="catalog-small-button danger" type="button" onClick={() => remove(item)} disabled={busy} autoFocus>{removing ? 'Removing…' : 'Remove'}</button></p>
          : <button id="remove-item" className="text-button danger" type="button" onClick={() => setConfirmRemove(true)} disabled={busy}>Remove item</button>}
        {saveActions}
      </div>
    </form>
  }

  function renderItems(entries, label) {
    if (!entries.length) return <p className="list-empty-message">{term ? `Nothing here matches “${query.trim()}”.` : label === 'To buy' ? 'Nothing left to buy.' : 'Nothing bought yet.'}</p>
    return <ul className="shopping-items" aria-label={label}>{entries.map((item) => {
      const editing = editor?.id === item.id
      const note = priceNote(item, currency)
      return <li className={`shopping-item${item.bought ? ' is-purchased' : ''}${editing ? ' is-editing' : ''}`} key={item.id}>
        <label className="purchased-control"><input id={`check-${item.id}`} type="checkbox" checked={item.bought === true} onChange={(event) => setBought(item, event.target.checked)} disabled={busy || reviewBusy} aria-label={item.name} /><Tick /></label>
        <button id={`edit-${item.id}`} className="row-edit" type="button" onClick={() => openEdit(item)} disabled={busy} aria-expanded={editing}>
          <span className="visually-hidden">Edit </span><span className="shopping-item-info"><strong>{item.name}</strong><small>{item.category || 'Grocery'}{note ? ` · ${note}` : ''}</small></span>
          <span className="shopping-item-quantity">{formatQuantity(item)}</span>
        </button>
        {editing && renderEditor(item)}
      </li>
    })}</ul>
  }

  function renderCategoryGroups(entries) {
    const groups = new Map()
    for (const item of entries) groups.set(item.category || 'Grocery', [...(groups.get(item.category || 'Grocery') || []), item])
    return [...groups].map(([category, groupItems]) => <section className="list-group" key={category} aria-label={category}><div className="section-heading"><h3>{category}</h3><span className="section-count">{groupItems.length}</span></div>{renderItems(groupItems, category)}</section>)
  }

  const findField = <div className="find-item">
    <label htmlFor="find-item">Find or add an item</label>
    <input id="find-item" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try eggs, rice, soap" maxLength={100} autoComplete="off" aria-describedby={term ? 'find-results' : undefined} />
    {term && <div id="find-results" className="find-results">
      {suggestions.length > 0 && <ul aria-label="Add from your catalog">{suggestions.map((product) => <li key={product.id}><span><strong>{product.name}</strong><small>{product.category}{boughtBefore.has(String(product.id)) ? ' · on your last trip' : ''}</small></span><button className="catalog-small-button" type="button" onClick={() => quickAdd(product)} disabled={addingProductId !== null} aria-label={addingProductId === product.id ? undefined : `Add ${product.name}`}>{addingProductId === product.id ? 'Adding…' : 'Add'}</button></li>)}</ul>}
      {!suggestions.length && !catalogQuery.loading && <div className="find-empty"><p className="optional-help">No catalog item matches “{query.trim()}”.</p><button className="catalog-small-button" type="button" onClick={() => onBrowseCatalog(query.trim())}>Find or create it in the catalog</button></div>}
    </div>}
  </div>

  return <main className="shopping-main">
    <div className="list-header">
      <div className="list-title"><h1>{name}</h1>{loading ? <p className="catalog-subtitle" role="status">Loading items…</p> : items.length > 0 && <p className="list-progress-line"><strong>{purchasedCount} of {items.length}</strong> bought{purchasePending > 0 ? <span className="saving-note"> · Saving…</span> : ''}</p>}</div>
      <div className="trip-actions"><button className="catalog-button secondary" type="button" onClick={onBrowseCatalog} disabled={busy || reviewBusy}>Browse catalog</button>{items.length > 0 && <button id="finish-shopping" className="catalog-button secondary" type="button" onClick={openReview} disabled={busy || loading || reviewBusy || purchasePending > 0}>{reviewBusy ? 'Preparing review…' : 'Finish shopping'}</button>}</div>
      {!loading && items.length > 0 && <div className="progress-track" role="img" aria-label={`${purchasedCount} of ${items.length} items bought`}><span style={{ width: `${progressPercent}%` }} /></div>}
    </div>
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {actionError && <p className="alert" role="alert">{actionError}</p>}
    {error && <div className="catalog-state" role="alert"><p>{error}</p><button className="catalog-button secondary" type="button" onClick={cartQuery.refresh}>Try again</button></div>}
    {loading && <div className="list-surface skeleton" aria-hidden="true">{[0, 1, 2, 3].map((row) => <div className="skeleton-row" key={row}><span /><span /></div>)}</div>}
    {!loading && (hasCart || !error) && <div className="shopping-content"><div className="shopping-primary">
      {findField}
      {items.length === 0 ? <section className="list-empty"><h2>Nothing on this list yet</h2><p>Type an item above to add it, or browse the catalog for ideas.</p></section> : <>
      <div className="list-tools"><label htmlFor="list-sort">Sort</label><select id="list-sort" value={sortMode} onChange={(event) => updateView({ sortMode: event.target.value })}><option value="default">To buy first</option><option value="az">A–Z</option><option value="category">By category</option></select><button className="hide-purchased-button" type="button" onClick={() => updateView({ hidePurchased: !hidePurchased })} aria-pressed={hidePurchased}>{hidePurchased ? 'Show bought' : 'Hide bought'}</button></div>
      <section className="list-surface" aria-label="Grocery items">
        {sortMode === 'category' ? (sortedItems.length ? renderCategoryGroups(sortedItems) : <p className="list-empty-message">{term ? `Nothing here matches “${query.trim()}”.` : 'Bought items are hidden.'}</p>)
          : term && !remainingItems.length && !purchasedItems.length ? <p className="list-empty-message">Nothing on this list matches “{query.trim()}”.</p>
          : sortMode !== 'default' ? <section className="list-group"><div className="section-heading"><h2>Items</h2><span className="section-count">{sortedItems.length}</span></div>{renderItems(sortedItems, 'Sorted shopping items')}</section> : <>
        <section className="list-group" aria-labelledby="remaining-heading">
          <div className="section-heading"><h2 id="remaining-heading">To buy</h2><span className="section-count">{remainingCount}</span>{purchasedCount === 0 && <span className="section-hint">Tap a circle as you shop · tap a name to edit</span>}</div>
          {renderItems(remainingItems, 'To buy')}
        </section>
        <section className="list-group purchased-group" aria-labelledby="purchased-heading">
          <div className="section-heading"><h2 id="purchased-heading">Bought</h2><span className="section-count">{purchasedCount}</span></div>
          {!hidePurchased ? renderItems(purchasedItems, 'Bought') : <div className="hidden-empty-state"><p>{purchasedCount} bought {purchasedCount === 1 ? 'item is' : 'items are'} hidden.</p><button className="hide-purchased-button" type="button" onClick={() => updateView({ hidePurchased: false })}>Show bought</button></div>}
        </section>
      </>}</section>
      {remainingCount === 0 && <div className="list-complete"><p><strong>Everything’s checked off.</strong> Finish to save this shop in Trips.</p><button id="finish-from-list" className="catalog-button primary" type="button" onClick={openReview} disabled={busy || reviewBusy || purchasePending > 0}>{reviewBusy ? 'Preparing review…' : 'Review and finish'}</button></div>}
      </>}</div>
    <details className="budget-panel" open={budgetEditing || Boolean(budgetError) || undefined}>
      <summary className="budget-panel-heading"><span><span className="budget-title">Budget and spending</span><span className="budget-line">{budgetLine}</span></span><span className="currency-label">{currency}</span></summary>
      <p className="optional-help">Your checklist works without prices or a budget.</p>
      <div className="budget-stat"><span>Budget</span><strong>{budget === null ? 'Not set' : formatMoney(budget, currency)}</strong></div>
      <div className="budget-stat"><span>Estimated total</span><strong>{spending.estimated.knownCount ? formatMoney(spending.estimated.total, currency) : 'No prices entered'}</strong></div>
      {spending.estimated.missingCount > 0 && <p className="incomplete-note">{spending.estimated.missingCount} {spending.estimated.missingCount === 1 ? 'item has' : 'items have'} no estimated price, so this total is incomplete.</p>}
      <div className="budget-stat"><span>Recorded spending</span><strong>{spending.actual.knownCount ? formatMoney(spending.actual.total, currency) : 'No prices entered'}</strong></div>
      {spending.actual.missingCount > 0 && <p className="incomplete-note">{spending.actual.missingCount} bought {spending.actual.missingCount === 1 ? 'item has' : 'items have'} no actual price, so this total is incomplete.</p>}
      <BudgetMeter budget={budget} summary={spending.estimated} currency={currency} label="Estimates against budget" /><BudgetMeter budget={budget} summary={spending.actual} currency={currency} label="Spending against budget" />
      {budgetError && <p className="alert" role="alert">{budgetError}</p>}
      {budgetEditing ? <form className="budget-form" onSubmit={saveBudget}><label htmlFor="trip-budget">Trip budget (optional, {currency})</label><input id="trip-budget" inputMode="decimal" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} placeholder="Leave blank to remove" autoFocus /><div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(false); setBudgetError('') }} disabled={busy}>Cancel</button><button className="catalog-button secondary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button></div></form> : <button className="budget-edit-button" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(true); setBudgetError(''); setNotice('') }} disabled={busy}>{budget === null ? 'Add a budget' : 'Edit or remove budget'}</button>}
    </details></div>}
    <p className="visually-hidden" role="status" aria-live="polite">{lastChange ? '' : announcement}</p>
    <div className="check-status" role="status" aria-live="polite">{lastChange && <p><span>{lastChange.text}</span>{!lastChange.undone && <button className="text-button" type="button" onClick={undoLastChange}>Undo</button>}</p>}</div>
  </main>
}
