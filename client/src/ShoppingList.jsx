import { useEffect, useRef, useState } from 'react'
import { deleteCartItem, getCart, updateCartItem } from './api/httpApi.js'

const EMPTY_FORM = { name: '', quantity: '1', unitLabel: '' }

function formFor(item) {
  return { name: item.name, quantity: String(item.quantity), unitLabel: item.unitLabel || '' }
}

function displayQuantity(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}

export default function ShoppingList({ editItem, onEditHandled, onBrowseCatalog }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestedEdit = useRef(editItem)

  useEffect(() => {
    if (editItem) requestedEdit.current = editItem
  }, [editItem])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getCart().then((result) => {
      if (!active) return
      setItems(result.items)
      const duplicate = requestedEdit.current
      if (duplicate) {
        setEditor({ id: duplicate.id })
        setForm(formFor(duplicate))
        setFormError('')
        requestedEdit.current = null
        onEditHandled()
      }
    }).catch(() => {
      if (active) setError('We could not load your shopping list. Check your connection and try again.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

  function openEdit(item) {
    setEditor({ id: item.id })
    setForm(formFor(item))
    setFormError('')
    setNotice('')
  }

  function closeEditor() {
    if (busy) return
    setEditor(null)
    setFormError('')
  }

  async function save(event) {
    event.preventDefault()
    const trimmedName = form.name.trim()
    const rawQuantity = form.quantity.trim()
    const validQuantity = /^(?:\d+)(?:\.\d{1,3})?$/.test(rawQuantity) && Number(rawQuantity) > 0
    if (!trimmedName) { setFormError('Enter an item name.'); return }
    if (!validQuantity) { setFormError('Enter a quantity greater than zero, with up to three decimal places.'); return }
    setBusy(true)
    setFormError('')
    try {
      const result = await updateCartItem(editor.id, {
        name: trimmedName,
        quantity: rawQuantity,
        unitLabel: form.unitLabel.trim(),
      })
      setItems((current) => current.map((item) => item.id === editor.id ? result.item : item))
      setEditor(null)
      setNotice('Shopping list item saved.')
    } catch (caught) {
      setFormError(caught.message || 'We could not save this item. Please try again.')
    } finally { setBusy(false) }
  }

  async function remove(item) {
    if (!window.confirm(`Remove “${item.name}” from your shopping list?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await deleteCartItem(item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      if (editor?.id === item.id) setEditor(null)
      setNotice(`${item.name} removed from your shopping list.`)
    } catch (caught) {
      setError(caught.message || 'We could not remove this item. Please try again.')
    } finally { setBusy(false) }
  }

  return <main className="shopping-main">
    <div className="shopping-heading">
      <div><p className="catalog-eyebrow">{items.length ? "TODAY'S TRIP" : 'YOUR CART'}</p><h1>My Shopping List</h1><p className="catalog-subtitle">{items.length ? 'Everything you need, in one easy list.' : 'A fresh start for your next trip.'}</p></div>
      <button className="catalog-button primary" type="button" onClick={onBrowseCatalog}>＋ Add Item</button>
    </div>
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {error && <div className="catalog-state" role="alert"><p>{error}</p><button className="catalog-button secondary" type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
    {loading && <div className="catalog-state" role="status"><p>Loading your shopping list…</p></div>}
    {!loading && !error && editor && <section className="catalog-panel list-editor" aria-labelledby="list-editor-title">
      <div className="editor-heading"><div><p className="catalog-eyebrow">SHOPPING LIST</p><h2 id="list-editor-title">Edit item</h2></div><button className="catalog-small-button" type="button" onClick={closeEditor} disabled={busy}>Cancel</button></div>
      <form className="catalog-form" onSubmit={save}>
        <label htmlFor="list-item-name">Item name</label><input id="list-item-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required autoFocus />
        <div className="quantity-fields"><div><label htmlFor="list-item-quantity">Quantity</label><input id="list-item-quantity" inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} maxLength={20} required /></div><div><label htmlFor="list-item-unit">Unit (optional)</label><input id="list-item-unit" value={form.unitLabel} onChange={(event) => setForm({ ...form, unitLabel: event.target.value })} maxLength={24} placeholder="kg, L, packs" /></div></div>
        {formError && <p className="alert" role="alert">{formError}</p>}
        <div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={closeEditor} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </section>}
    {!loading && !error && (items.length === 0 ? <section className="catalog-state empty-list"><span className="empty-list-icon" aria-hidden="true">▣</span><h2>Your list is empty</h2><p>Add groceries when you're ready. Your reusable catalog is just a tap away.</p><button className="catalog-button primary" type="button" onClick={onBrowseCatalog}>＋ Add Item</button></section> : <>
      <div className="list-summary"><div><strong>{items.length} {items.length === 1 ? 'item' : 'items'}</strong><span>Quantities are for planning what to buy.</span></div><button className="catalog-button secondary" type="button" onClick={onBrowseCatalog}>Browse catalog</button></div>
      <ul className="shopping-items" aria-label="Items in your shopping list">{items.map((item) => <li className="shopping-item" key={item.id}>
        <span className="catalog-icon" aria-hidden="true">{(item.category || 'Grocery').slice(0, 2).toUpperCase()}</span>
        <span className="shopping-item-info"><strong>{item.name}</strong><small>{item.category || 'Grocery'} · {displayQuantity(item.quantity)}{item.unitLabel ? ` ${item.unitLabel}` : ''}</small></span>
        <span className="shopping-item-actions"><button className="catalog-small-button" type="button" onClick={() => openEdit(item)}>Edit</button><button className="catalog-small-button remove-button" type="button" onClick={() => remove(item)} disabled={busy}>Remove</button></span>
      </li>)}</ul>
      <p className="list-footnote">Checking off items, prices, and trip history will be available in a future milestone.</p>
    </>)}
  </main>
}
