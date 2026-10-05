import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteListItem, finishTrip, getList, updateList, updateListItem } from './api/httpApi.js'
import { getShoppingProgress, sortShoppingItems } from './shoppingProgress.js'
import { budgetProgress, formatMoney, moneySummary, normalizeMoney } from './money.js'
import { createPurchaseMutations, mergePendingListResponse } from './purchaseMutations.js'
import { useDataCache, useDataQuery } from './dataCache.jsx'
import { cacheCompletedTrip, removeListSummary, replaceListSummary } from './dataCache.js'

const EMPTY_FORM = { name: '', quantity: '1', unitLabel: '', estimatedTotal: '', actualTotal: '' }

function formFor(item) {
  return { name: item.name, quantity: String(item.quantity), unitLabel: item.unitLabel || '', estimatedTotal: item.estimatedTotal ?? '', actualTotal: item.actualTotal ?? '' }
}

function displayQuantity(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}

function ReviewRows({ items, currency }) {
  if (!items.length) return <p className="optional-help">No items in this group.</p>
  return <ul className="trip-review-list">{items.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{displayQuantity(item.quantity)}{item.unitLabel ? ` ${item.unitLabel}` : ''} · Estimate: {item.estimatedTotal == null ? 'not recorded' : formatMoney(item.estimatedTotal, currency)} · Actual: {item.actualTotal == null ? 'not recorded' : formatMoney(item.actualTotal, currency)}</small></span><span className="trip-status">{item.bought ? 'BOUGHT' : 'NOT BOUGHT'}</span></li>)}</ul>
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

export default function ShoppingList({ listId, active = true, editItem, onEditHandled, onBrowseCatalog, onBackToLists, onMutationPending, onReviewChange }) {
  const cache = useDataCache()
  const cacheKey = `list:${listId}`
  const fetchList = (signal) => getList(listId, { signal })
  const [reviewing, setReviewing] = useState(false)
  const cartQuery = useDataQuery(cacheKey, fetchList, { enabled: active && !reviewing })
  const { items = [], currency = 'PHP', tripId = listId, revision = null, budget = null, name = 'Shopping list' } = cartQuery.data || {}
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
  const [finished, setFinished] = useState(false)
  const reviewRef = useRef(null)
  const reviewSurfaceRef = useRef(null)
  const finishTriggerRef = useRef(null)
  const mounted = useRef(false)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [budgetEditing, setBudgetEditing] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyItemId, setBusyItemId] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [hidePurchased, setHidePurchased] = useState(false)
  const [sortMode, setSortMode] = useState('default')
  const [purchasePending, setPurchasePending] = useState(0)
  const purchases = useMemo(() => createPurchaseMutations(cache, (itemId, input) => updateListItem(listId, itemId, input), {
    onPending: (count) => { setPurchasePending(count); onMutationPending(Boolean(count || pendingMutation.current)) }, onError: setActionError, listId,
  }), [cache, listId])
  useEffect(() => purchases.subscribe(), [purchases])
  const pendingMutation = useRef(false)
  const editorVersion = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  function reportPending() { onMutationPending(Boolean(pendingMutation.current || purchases.size)) }

  useEffect(() => { onReviewChange(reviewing) }, [reviewing, onReviewChange])
  useEffect(() => () => { onReviewChange(false); onMutationPending(false) }, [])

  useEffect(() => {
    if (!editItem) return
    editorVersion.current += 1
    setItems((current) => current.some((item) => item.id === editItem.id)
      ? current.map((item) => item.id === editItem.id ? editItem : item)
      : [...current, editItem])
    setEditor({ id: editItem.id })
    setForm(formFor(editItem))
    setFormError('')
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
        requestAnimationFrame(() => finishTriggerRef.current?.focus())
      }
      if (event.key !== 'Tab') return
      const controls = [...reviewSurfaceRef.current.querySelectorAll('button:not(:disabled)')]
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
      setHidePurchased(false)
      setReviewing(false)
      setFinished(true)
      setNotice('Your list was saved to history.')
      onBackToLists?.()
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
    editorVersion.current += 1
    setEditor({ id: item.id })
    setForm(formFor(item))
    setFormError('')
    setActionError('')
    setNotice('')
  }

  function closeEditor() {
    if (busy) return
    setEditor(null)
    setFormError('')
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
      setNotice('Shopping list item saved.')
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
    if (!window.confirm(`Remove “${item.name}” from your shopping list?`)) return
    const previousIndex = items.findIndex((entry) => entry.id === item.id)
    pendingMutation.current = true
    const release = cache.beginMutation(cacheKey)
    reportPending()
    setBusy(true)
    setBusyItemId(item.id)
    setBusyAction('remove')
    setActionError('')
    setNotice('')
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    try {
      const result = await deleteListItem(listId, item.id)
      const serverList = mergePendingListResponse(cache, listId, result.list)
      cache.set(cacheKey, serverList)
      replaceListSummary(cache, serverList)
      if (editor?.id === item.id) setEditor(null)
      setNotice(`${item.name} removed from your shopping list.`)
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

  function setBought(item, bought) {
    if (pendingMutation.current || reviewBusy) return
    setActionError('')
    setNotice('')
    purchases.set(item.id, bought)
  }

  const { purchasedCount, remainingCount, visibleItems } = getShoppingProgress(items, hidePurchased)
  const sortedItems = sortShoppingItems(visibleItems, sortMode)
  const remainingItems = visibleItems.filter((item) => item.bought !== true)
  const purchasedItems = visibleItems.filter((item) => item.bought === true)
  const progressPercent = items.length ? (purchasedCount / items.length) * 100 : 0
  const spending = moneySummary(items)

  if (reviewing) return <main className="shopping-main trip-screen" aria-labelledby="finish-title" ref={reviewSurfaceRef}>
    <div className="shopping-heading"><div><p className="catalog-eyebrow">REVIEW YOUR LIST</p><h1 id="finish-title" ref={reviewRef} tabIndex="-1">Finish shopping?</h1><p className="catalog-subtitle">Check “{name}” before saving it to history.</p></div><span className="currency-label">{currency}</span></div>
    <section className="progress-card" aria-label="Shopping progress"><div className="progress-copy"><span className="progress-icon" aria-hidden="true">✓</span><div><p className="progress-kicker">SHOPPING PROGRESS</p><p className="progress-title">{purchasedCount} of {items.length} items bought</p></div></div><div className="progress-number"><strong>{purchasedCount} <span>/ {items.length}</span></strong><small>items picked up</small></div><div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div></section>
    <div className="trip-review-grid"><section className="catalog-panel"><h2>Bought <span className="count-badge">{purchasedCount}</span></h2><ReviewRows items={items.filter((item) => item.bought)} currency={currency} /><h2>Not bought <span className="count-badge">{remainingCount}</span></h2><ReviewRows items={items.filter((item) => !item.bought)} currency={currency} /></section>
      <aside className="catalog-panel"><p className="catalog-eyebrow">OPTIONAL SPENDING</p><h2>{spending.actual.knownCount ? formatMoney(spending.actual.total, currency) : 'No actual prices recorded'}</h2><p className="optional-help">{spending.actual.missingCount ? `${spending.actual.missingCount} bought item${spending.actual.missingCount === 1 ? ' has' : 's have'} no actual price. Recorded spending is incomplete.` : spending.actual.knownCount ? 'Recorded spending includes all bought items.' : 'You can finish without recording prices.'}</p><p className="optional-help">{remainingCount} unchecked item{remainingCount === 1 ? '' : 's'} will be saved as not bought. Other active lists remain available.</p>{budget !== null && <p className="optional-help">Budget: {formatMoney(budget, currency)}. Going over budget does not prevent finishing.</p>}{finishError && <p className="alert" role="alert">{finishError}</p>}<div className="trip-actions"><button className="catalog-button secondary" type="button" onClick={() => { setReviewing(false); setFinishError(''); if (finishError) cache.invalidate(cacheKey); requestAnimationFrame(() => finishTriggerRef.current?.focus()) }} disabled={finishBusy}>Keep shopping</button><button className="catalog-button primary" type="button" onClick={confirmFinish} disabled={finishBusy}>{finishBusy ? 'Saving trip…' : 'Confirm and finish'}</button></div></aside></div>
  </main>

  function renderItems(entries, label) {
    if (!entries.length) return <p className="list-empty-message" role="status">{label === 'Items still to buy' ? 'Everything on your list has been purchased.' : hidePurchased ? 'Purchased items are hidden.' : 'No items purchased yet.'}</p>
    return <ul className="shopping-items" aria-label={label}>{entries.map((item) => <li className={`shopping-item${item.bought ? ' is-purchased' : ''}`} key={item.id}>
      <label className="purchased-control"><input type="checkbox" checked={item.bought === true} onChange={(event) => setBought(item, event.target.checked)} disabled={busy || reviewBusy} aria-label={item.bought ? `Mark ${item.name} as unpurchased` : `Mark ${item.name} as purchased`} /><span className="purchased-checkmark" aria-hidden="true" /> <span className="visually-hidden">Purchased</span></label>
      <span className="shopping-item-info"><strong>{item.name}</strong><small>{item.category || 'Grocery'}</small><small className="item-price">Estimate: {item.estimatedTotal === null || item.estimatedTotal === undefined ? 'Not recorded' : formatMoney(item.estimatedTotal, currency)} · Actual: {item.actualTotal === null || item.actualTotal === undefined ? 'Not recorded' : formatMoney(item.actualTotal, currency)}</small></span>
      <span className="shopping-item-quantity">{displayQuantity(item.quantity)}{item.unitLabel ? ` ${item.unitLabel}` : ''}</span>
      <span className="shopping-item-actions"><button className="catalog-small-button" type="button" onClick={() => openEdit(item)} disabled={busy}>Edit</button><button className="catalog-small-button remove-button" type="button" onClick={() => remove(item)} disabled={busy}>{busy && busyItemId === item.id && busyAction === 'remove' ? 'Removing…' : 'Remove'}</button></span>
    </li>)}</ul>
  }

  return <main className="shopping-main">
    <div className="shopping-heading">
      <div><p className="catalog-eyebrow">{loading ? 'SHOPPING LIST' : name}</p><h1>{name}</h1><p className="catalog-subtitle">{loading ? 'Loading your list.' : items.length ? 'Everything you need, in one easy list.' : 'Add groceries when you are ready.'}</p></div>
      <div className="trip-actions"><button className="catalog-button secondary" type="button" onClick={onBackToLists}>My Lists</button><button className="catalog-button secondary" type="button" onClick={cartQuery.refresh} disabled={busy || reviewBusy || cartQuery.fetching}>Refresh list</button><button className="catalog-button primary" type="button" onClick={onBrowseCatalog} disabled={busy || reviewBusy}>＋ Add Item</button>{items.length > 0 && <button ref={finishTriggerRef} className="catalog-button secondary" type="button" onClick={openReview} disabled={busy || loading || reviewBusy || purchasePending > 0}>{reviewBusy ? 'Preparing review…' : 'Finish shopping'}</button>}</div>
    </div>
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {finished && <p className="catalog-notice" role="status">Your completed list is available in History.</p>}
    {actionError && <p className="alert" role="alert">{actionError}</p>}
    {error && <div className="catalog-state" role="alert"><p>{error}</p><button className="catalog-button secondary" type="button" onClick={cartQuery.refresh}>Try again</button></div>}
    {loading && <div className="catalog-state" role="status"><p>Loading your shopping list…</p></div>}
    {!loading && (hasCart || !error) && editor && <section className="catalog-panel list-editor" aria-labelledby="list-editor-title">
      <div className="editor-heading"><div><p className="catalog-eyebrow">SHOPPING LIST</p><h2 id="list-editor-title">Edit item</h2></div><button className="catalog-small-button" type="button" onClick={closeEditor} disabled={busy}>Cancel</button></div>
      <form className="catalog-form" onSubmit={save}>
        <label htmlFor="list-item-name">Item name</label><input id="list-item-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required autoFocus />
        <div className="quantity-fields"><div><label htmlFor="list-item-quantity">Quantity</label><input id="list-item-quantity" inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} maxLength={20} required /></div><div><label htmlFor="list-item-unit">Unit (optional)</label><input id="list-item-unit" value={form.unitLabel} onChange={(event) => setForm({ ...form, unitLabel: event.target.value })} maxLength={24} placeholder="kg, L, packs" /></div></div>
        <p className="optional-help">Optional totals for this list entry in {currency}. Leave blank if unknown; enter 0 for a free item. Quantity does not multiply these amounts.</p>
        <div className="quantity-fields"><div><label htmlFor="list-item-estimate">Estimated total (optional)</label><input id="list-item-estimate" inputMode="decimal" value={form.estimatedTotal} onChange={(event) => setForm({ ...form, estimatedTotal: event.target.value })} placeholder="0.00" aria-describedby="item-price-help" /></div><div><label htmlFor="list-item-actual">Actual total (optional)</label><input id="list-item-actual" inputMode="decimal" value={form.actualTotal} onChange={(event) => setForm({ ...form, actualTotal: event.target.value })} placeholder="0.00" aria-describedby="item-price-help" /></div></div>
        <span id="item-price-help" className="visually-hidden">Blank means no price recorded. Zero is a recorded amount.</span>
        {formError && <p className="alert" role="alert">{formError}</p>}
        <div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={closeEditor} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </section>}
    {!loading && (hasCart || !error) && <div className="shopping-content"><div className="shopping-primary">{items.length === 0 ? <section className="catalog-state empty-list"><span className="empty-list-icon" aria-hidden="true">▣</span><h2>Your list is empty</h2><p>Add groceries when you're ready. Your reusable catalog is just a tap away.</p><button className="catalog-button primary" type="button" onClick={onBrowseCatalog} disabled={busy}>＋ Add Item</button></section> : <>
      <section className="progress-card" aria-label="Shopping progress">
        <div className="progress-copy"><span className="progress-icon" aria-hidden="true">✓</span><div><p className="progress-kicker">SHOPPING PROGRESS</p><p className="progress-title">{remainingCount === 0 ? 'All items picked up' : purchasedCount === 0 ? 'Ready to get started' : "You're making good progress"}</p><p className="progress-summary" aria-live="polite">{remainingCount} remaining / {purchasedCount} purchased</p></div></div>
        <div className="progress-number" aria-live="polite"><strong>{purchasedCount} <span>/ {items.length}</span></strong><small>items picked up</small></div>
        <div className="progress-track" role="img" aria-label={`${purchasedCount} of ${items.length} items purchased`}><span style={{ width: `${progressPercent}%` }} /></div>
      </section>
      <div className="list-tools"><label htmlFor="list-sort">Sort</label><select id="list-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="default">Default</option><option value="az">A–Z</option><option value="category">Category</option><option value="unpurchased">Unpurchased First</option><option value="purchased">Purchased First</option></select><button className="hide-purchased-button" type="button" onClick={() => setHidePurchased((hidden) => !hidden)} aria-pressed={hidePurchased}>{hidePurchased ? 'Show purchased' : 'Hide purchased'}</button></div>
      <section className="list-surface" aria-label="Grocery items">
        {sortMode !== 'default' ? <section className="list-group"><div className="section-heading"><h2>Shopping items</h2><span className="count-badge">{sortedItems.length} items</span></div>{sortedItems.length ? renderItems(sortedItems, 'Sorted shopping items') : <p className="list-empty-message" role="status">Purchased items are hidden.</p>}</section> : <>
        <section className="list-group" aria-labelledby="remaining-heading">
          <div className="section-heading"><div><h2 id="remaining-heading">Still to buy</h2><span className="count-badge">{remainingCount} {remainingCount === 1 ? 'item' : 'items'}</span></div><span className="section-hint">Tap a circle as you shop</span></div>
          {renderItems(remainingItems, 'Items still to buy')}
        </section>
        <section className="list-group purchased-group" aria-labelledby="purchased-heading">
          <div className="section-heading purchased-heading"><div><h2 id="purchased-heading">Purchased</h2><span className="count-badge purchased-count">{purchasedCount} {purchasedCount === 1 ? 'item' : 'items'}</span></div></div>
          {!hidePurchased ? renderItems(purchasedItems, 'Purchased items') : visibleItems.length === 0 ? <div className="hidden-empty-state" role="status"><p>There are no visible items because all purchased items are hidden.</p><button className="hide-purchased-button" type="button" onClick={() => setHidePurchased(false)}>Show purchased</button></div> : null}
        </section>
      </>}</section>
    </>}</div>
    <section className="budget-panel" aria-labelledby="budget-heading">
      <div className="budget-panel-heading"><div><p className="catalog-eyebrow">OPTIONAL</p><h2 id="budget-heading">Budget and spending</h2></div><span className="currency-label">{currency}</span></div>
      <p className="optional-help">Your checklist works without prices or a budget.</p>
      <div className="budget-stat"><span>Budget</span><strong>{budget === null ? 'Not set' : formatMoney(budget, currency)}</strong></div>
      <div className="budget-stat"><span>Known estimated total</span><strong>{spending.estimated.knownCount ? formatMoney(spending.estimated.total, currency) : 'No prices entered'}</strong></div>
      {spending.estimated.missingCount > 0 && <p className="incomplete-note">{spending.estimated.missingCount} {spending.estimated.missingCount === 1 ? 'item has' : 'items have'} no estimated price. Estimate is incomplete.</p>}
      <div className="budget-stat"><span>Known actual spending</span><strong>{spending.actual.knownCount ? formatMoney(spending.actual.total, currency) : 'No prices entered'}</strong></div>
      {spending.actual.missingCount > 0 && <p className="incomplete-note">{spending.actual.missingCount} purchased {spending.actual.missingCount === 1 ? 'item has' : 'items have'} no actual price. Spending is incomplete.</p>}
      <BudgetMeter budget={budget} summary={spending.estimated} currency={currency} label="Known estimates against budget" /><BudgetMeter budget={budget} summary={spending.actual} currency={currency} label="Known spending against budget" />
      {budgetError && <p className="alert" role="alert">{budgetError}</p>}
      {budgetEditing ? <form className="budget-form" onSubmit={saveBudget}><label htmlFor="trip-budget">Trip budget (optional, {currency})</label><input id="trip-budget" inputMode="decimal" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} placeholder="Leave blank to remove" autoFocus /><div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(false); setBudgetError('') }} disabled={busy}>Cancel</button><button className="catalog-button secondary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button></div></form> : <button className="budget-edit-button" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(true); setBudgetError(''); setNotice('') }} disabled={busy}>{budget === null ? 'Add a budget' : 'Edit or remove budget'}</button>}
    </section></div>}
  </main>
}
