import { useEffect, useRef, useState } from 'react'
import { deleteCartItem, getCart, updateCart, updateCartItem } from './api/httpApi.js'
import { getShoppingProgress } from './shoppingProgress.js'
import { formatMoney, moneyDifference, moneySummary, normalizeMoney } from './money.js'

const EMPTY_FORM = { name: '', quantity: '1', unitLabel: '', estimatedTotal: '', actualTotal: '' }

function formFor(item) {
  return { name: item.name, quantity: String(item.quantity), unitLabel: item.unitLabel || '', estimatedTotal: item.estimatedTotal ?? '', actualTotal: item.actualTotal ?? '' }
}

function displayQuantity(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}

export default function ShoppingList({ editItem, onEditHandled, onBrowseCatalog, onMutationPending }) {
  const [items, setItems] = useState([])
  const [currency, setCurrency] = useState('PHP')
  const [budget, setBudget] = useState(null)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [budgetEditing, setBudgetEditing] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyItemId, setBusyItemId] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [hidePurchased, setHidePurchased] = useState(false)
  const pendingMutation = useRef(false)
  const addedItemVersion = useRef(0)
  const editorVersion = useRef(0)

  useEffect(() => {
    if (!editItem) return
    addedItemVersion.current += 1
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

  useEffect(() => {
    let active = true
    const versionAtLoad = addedItemVersion.current
    setLoading(true)
    setError('')
    getCart().then((result) => {
      if (!active) return
      setCurrency(result.currency)
      setBudget(result.budget)
      setBudgetDraft(result.budget ?? '')
      setItems((current) => {
        if (addedItemVersion.current === versionAtLoad) return result.items
        const loadedIds = new Set(result.items.map((item) => item.id))
        return [...result.items, ...current.filter((item) => !loadedIds.has(item.id))]
      })
    }).catch(() => {
      if (active) setError('We could not load your shopping list. Check your connection and try again.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

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
    const versionAtSave = editorVersion.current
    const previous = items.find((item) => item.id === itemId)
    if (!previous) { setFormError('This item is no longer in your list. Try again.'); return }
    pendingMutation.current = true
    onMutationPending(true)
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
      const result = await updateCartItem(itemId, {
        name: trimmedName,
        quantity: rawQuantity,
        unitLabel: form.unitLabel.trim(),
        estimatedTotal,
        actualTotal,
      })
      setItems((current) => current.map((item) => item.id === itemId ? result.item : item))
      setNotice('Shopping list item saved.')
    } catch (caught) {
      setItems((current) => current.map((item) => item.id === itemId ? previous : item))
      if (editorVersion.current === versionAtSave) {
        setEditor({ id: itemId })
        setFormError(caught.message || 'We could not save this item. Please try again.')
      } else setActionError(caught.message || 'We could not save this item. Please try again.')
    } finally { pendingMutation.current = false; onMutationPending(false); setBusy(false); setBusyItemId(null); setBusyAction('') }
  }

  async function saveBudget(event) {
    event.preventDefault()
    if (pendingMutation.current) return
    let nextBudget
    try { nextBudget = normalizeMoney(budgetDraft) }
    catch (caught) { setBudgetError(caught.message); return }
    const previous = budget
    pendingMutation.current = true
    onMutationPending(true)
    setBusy(true)
    setBudgetError('')
    setActionError('')
    setNotice('')
    setBudget(nextBudget)
    setBudgetEditing(false)
    try {
      const result = await updateCart({ budget: nextBudget })
      setBudget(result.budget)
      setBudgetDraft(result.budget ?? '')
      setNotice(nextBudget === null ? 'Budget removed.' : 'Budget saved.')
    } catch (caught) {
      setBudget(previous)
      setBudgetDraft(nextBudget ?? '')
      setBudgetEditing(true)
      setBudgetError(caught.message || 'We could not save your budget. Please try again.')
    } finally { pendingMutation.current = false; onMutationPending(false); setBusy(false) }
  }

  async function remove(item) {
    if (pendingMutation.current) return
    if (!window.confirm(`Remove “${item.name}” from your shopping list?`)) return
    const previousIndex = items.findIndex((entry) => entry.id === item.id)
    pendingMutation.current = true
    onMutationPending(true)
    setBusy(true)
    setBusyItemId(item.id)
    setBusyAction('remove')
    setActionError('')
    setNotice('')
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    try {
      await deleteCartItem(item.id)
      if (editor?.id === item.id) setEditor(null)
      setNotice(`${item.name} removed from your shopping list.`)
    } catch (caught) {
      setItems((current) => {
        if (current.some((entry) => entry.id === item.id)) return current
        const restored = [...current]
        restored.splice(Math.min(previousIndex, restored.length), 0, item)
        return restored
      })
      setActionError(caught.message || 'We could not remove this item. Please try again.')
    } finally { pendingMutation.current = false; onMutationPending(false); setBusy(false); setBusyItemId(null); setBusyAction('') }
  }

  async function setBought(item, bought) {
    if (pendingMutation.current) return
    pendingMutation.current = true
    onMutationPending(true)
    setBusy(true)
    setBusyItemId(item.id)
    setBusyAction('bought')
    setActionError('')
    setNotice('')
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, bought } : entry))
    try {
      const result = await updateCartItem(item.id, { bought })
      setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry))
      setNotice(bought ? `${item.name} marked as purchased.` : `${item.name} marked as not purchased.`)
    } catch (caught) {
      setItems((current) => current.map((entry) => entry.id === item.id ? item : entry))
      setActionError(caught.message || 'We could not update this item. Please try again.')
    } finally { pendingMutation.current = false; onMutationPending(false); setBusy(false); setBusyItemId(null); setBusyAction('') }
  }

  const { purchasedCount, remainingCount, visibleItems } = getShoppingProgress(items, hidePurchased)
  const remainingItems = visibleItems.filter((item) => item.bought !== true)
  const purchasedItems = visibleItems.filter((item) => item.bought === true)
  const progressPercent = items.length ? (purchasedCount / items.length) * 100 : 0
  const spending = moneySummary(items)
  const estimatedComparison = budget === null ? null : moneyDifference(budget, spending.estimated.total)
  const actualComparison = budget === null ? null : moneyDifference(budget, spending.actual.total)

  function renderItems(entries, label) {
    if (!entries.length) return <p className="list-empty-message" role="status">{label === 'Items still to buy' ? 'Everything on your list has been purchased.' : hidePurchased ? 'Purchased items are hidden.' : 'No items purchased yet.'}</p>
    return <ul className="shopping-items" aria-label={label}>{entries.map((item) => <li className={`shopping-item${item.bought ? ' is-purchased' : ''}`} key={item.id}>
      <label className="purchased-control"><input type="checkbox" checked={item.bought === true} onChange={(event) => setBought(item, event.target.checked)} disabled={busy} aria-label={item.bought ? `Mark ${item.name} as unpurchased` : `Mark ${item.name} as purchased`} /><span className="purchased-checkmark" aria-hidden="true" /> <span className="visually-hidden">{busy && busyItemId === item.id && busyAction === 'bought' ? 'Saving purchase status' : 'Purchased'}</span></label>
      <span className="shopping-item-info"><strong>{item.name}</strong><small>{item.category || 'Grocery'}</small><small className="item-price">Estimate: {item.estimatedTotal === null || item.estimatedTotal === undefined ? 'Not recorded' : formatMoney(item.estimatedTotal, currency)} · Actual: {item.actualTotal === null || item.actualTotal === undefined ? 'Not recorded' : formatMoney(item.actualTotal, currency)}</small></span>
      <span className="shopping-item-quantity">{displayQuantity(item.quantity)}{item.unitLabel ? ` ${item.unitLabel}` : ''}</span>
      <span className="shopping-item-actions"><button className="catalog-small-button" type="button" onClick={() => openEdit(item)} disabled={busy}>Edit</button><button className="catalog-small-button remove-button" type="button" onClick={() => remove(item)} disabled={busy}>{busy && busyItemId === item.id && busyAction === 'remove' ? 'Removing…' : 'Remove'}</button></span>
    </li>)}</ul>
  }

  return <main className="shopping-main">
    <div className="shopping-heading">
      <div><p className="catalog-eyebrow">{loading ? 'SHOPPING LIST' : items.length ? "TODAY'S TRIP" : 'YOUR CART'}</p><h1>My Shopping List</h1><p className="catalog-subtitle">{loading ? 'Loading your active list.' : items.length ? 'Everything you need, in one easy list.' : 'A fresh start for your next trip.'}</p></div>
      <button className="catalog-button primary" type="button" onClick={onBrowseCatalog} disabled={busy}>＋ Add Item</button>
    </div>
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {actionError && <p className="alert" role="alert">{actionError}</p>}
    {error && <div className="catalog-state" role="alert"><p>{error}</p><button className="catalog-button secondary" type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
    {loading && <div className="catalog-state" role="status"><p>Loading your shopping list…</p></div>}
    {!loading && !error && editor && <section className="catalog-panel list-editor" aria-labelledby="list-editor-title">
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
    {!loading && !error && <div className="shopping-content"><div className="shopping-primary">{items.length === 0 ? <section className="catalog-state empty-list"><span className="empty-list-icon" aria-hidden="true">▣</span><h2>Your list is empty</h2><p>Add groceries when you're ready. Your reusable catalog is just a tap away.</p><button className="catalog-button primary" type="button" onClick={onBrowseCatalog} disabled={busy}>＋ Add Item</button></section> : <>
      <section className="progress-card" aria-label="Shopping progress">
        <div className="progress-copy"><span className="progress-icon" aria-hidden="true">✓</span><div><p className="progress-kicker">SHOPPING PROGRESS</p><p className="progress-title">{remainingCount === 0 ? 'All items picked up' : purchasedCount === 0 ? 'Ready to get started' : "You're making good progress"}</p><p className="progress-summary" aria-live="polite">{remainingCount} remaining / {purchasedCount} purchased</p></div></div>
        <div className="progress-number" aria-live="polite"><strong>{purchasedCount} <span>/ {items.length}</span></strong><small>items picked up</small></div>
        <div className="progress-track" role="img" aria-label={`${purchasedCount} of ${items.length} items purchased`}><span style={{ width: `${progressPercent}%` }} /></div>
      </section>
      <section className="list-surface" aria-label="Grocery items">
        <section className="list-group" aria-labelledby="remaining-heading">
          <div className="section-heading"><div><h2 id="remaining-heading">Still to buy</h2><span className="count-badge">{remainingCount} {remainingCount === 1 ? 'item' : 'items'}</span></div><span className="section-hint">Tap a circle as you shop</span></div>
          {renderItems(remainingItems, 'Items still to buy')}
        </section>
        <section className="list-group purchased-group" aria-labelledby="purchased-heading">
          <div className="section-heading purchased-heading"><div><h2 id="purchased-heading">Purchased</h2><span className="count-badge purchased-count">{purchasedCount} {purchasedCount === 1 ? 'item' : 'items'}</span></div><button className="hide-purchased-button" type="button" onClick={() => setHidePurchased((hidden) => !hidden)} aria-pressed={hidePurchased}>{hidePurchased ? 'Show purchased' : 'Hide purchased'}</button></div>
          {!hidePurchased ? renderItems(purchasedItems, 'Purchased items') : visibleItems.length === 0 ? <div className="hidden-empty-state" role="status"><p>There are no visible items because all purchased items are hidden.</p><button className="hide-purchased-button" type="button" onClick={() => setHidePurchased(false)}>Show purchased</button></div> : null}
        </section>
      </section>
    </>}</div>
    <section className="budget-panel" aria-labelledby="budget-heading">
      <div className="budget-panel-heading"><div><p className="catalog-eyebrow">OPTIONAL</p><h2 id="budget-heading">Budget and spending</h2></div><span className="currency-label">{currency}</span></div>
      <p className="optional-help">Your checklist works without prices or a budget.</p>
      <div className="budget-stat"><span>Budget</span><strong>{budget === null ? 'Not set' : formatMoney(budget, currency)}</strong></div>
      <div className="budget-stat"><span>Known estimated total</span><strong>{spending.estimated.knownCount ? formatMoney(spending.estimated.total, currency) : 'No prices entered'}</strong></div>
      {spending.estimated.missingCount > 0 && <p className="incomplete-note">{spending.estimated.missingCount} {spending.estimated.missingCount === 1 ? 'item has' : 'items have'} no estimated price. Estimate is incomplete.</p>}
      <div className="budget-stat"><span>Known actual spending</span><strong>{spending.actual.knownCount ? formatMoney(spending.actual.total, currency) : 'No prices entered'}</strong></div>
      {spending.actual.missingCount > 0 && <p className="incomplete-note">{spending.actual.missingCount} purchased {spending.actual.missingCount === 1 ? 'item has' : 'items have'} no actual price. Spending is incomplete.</p>}
      {estimatedComparison && spending.estimated.knownCount > 0 && <p className={estimatedComparison.over ? 'budget-warning' : 'budget-comparison'}>Known estimates are {estimatedComparison.over ? `${formatMoney(estimatedComparison.value, currency)} over` : `${formatMoney(estimatedComparison.value, currency)} under`} budget{spending.estimated.missingCount ? '; estimate is incomplete' : ''}.</p>}
      {actualComparison && spending.actual.knownCount > 0 && <p className={actualComparison.over ? 'budget-warning' : 'budget-comparison'}>Known spending is {actualComparison.over ? `${formatMoney(actualComparison.value, currency)} over` : `${formatMoney(actualComparison.value, currency)} under`} budget{spending.actual.missingCount ? '; spending is incomplete' : ''}.</p>}
      {budgetError && <p className="alert" role="alert">{budgetError}</p>}
      {budgetEditing ? <form className="budget-form" onSubmit={saveBudget}><label htmlFor="trip-budget">Trip budget (optional, {currency})</label><input id="trip-budget" inputMode="decimal" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} placeholder="Leave blank to remove" autoFocus /><div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(false); setBudgetError('') }} disabled={busy}>Cancel</button><button className="catalog-button secondary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button></div></form> : <button className="budget-edit-button" type="button" onClick={() => { setBudgetDraft(budget ?? ''); setBudgetEditing(true); setBudgetError(''); setNotice('') }} disabled={busy}>{budget === null ? 'Add a budget' : 'Edit or remove budget'}</button>}
    </section></div>}
  </main>
}
