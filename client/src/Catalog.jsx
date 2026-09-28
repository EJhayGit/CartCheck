import { useEffect, useState } from 'react'
import { createCatalogItem, deleteCatalogItem, getCatalog, updateCatalogItem } from './api/httpApi.js'

const CATEGORIES = ['Produce', 'Dairy & eggs', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Household', 'Other']
const CATEGORY_LABELS = { 'Dairy & eggs': 'Dairy', 'Meat & seafood': 'Meat & seafood' }
const EMPTY_ITEM = { name: '', category: 'Produce' }
const sortItems = (items) => [...items].sort((a, b) =>
  a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()) || Number(a.id) - Number(b.id))

export default function Catalog({ onAdd, onAddPending }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingId, setAddingId] = useState(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = setTimeout(async () => {
      try {
        const result = await getCatalog({ search: search.trim(), category, signal: controller.signal })
        if (active) setItems(result.items)
      } catch {
        if (active) setError('We could not load your catalog. Check your connection and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }, search ? 250 : 0)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [search, category, refresh])

  function openCreate() {
    setEditor({ mode: 'create' })
    setForm({ name: search.trim().slice(0, 120), category: category || 'Produce' })
    setFormError('')
    setNotice('')
  }

  function openEdit(item) {
    setEditor({ mode: 'edit', id: item.id })
    setForm({ name: item.name, category: item.category })
    setFormError('')
    setNotice('')
  }

  async function save(event) {
    event.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const input = { name: form.name.trim(), category: form.category }
      if (editor.mode === 'create') {
        const created = await createCatalogItem(input)
        if (search.trim() === created.item.name) setRefresh((value) => value + 1)
        else setSearch(created.item.name)
      } else {
        const updated = await updateCatalogItem(editor.id, input)
        if (search.trim() || category) setRefresh((value) => value + 1)
        else setItems((current) => sortItems(current.map((item) => item.id === editor.id ? updated.item : item)))
      }
      setNotice(editor.mode === 'create' ? 'Custom grocery saved to your catalog.' : 'Catalog item updated.')
      setEditor(null)
    } catch (caught) {
      setFormError(caught.message)
    } finally { setBusy(false) }
  }

  async function remove(item) {
    if (!window.confirm(`Delete “${item.name}” from your catalog?`)) return
    setNotice('')
    try {
      await deleteCatalogItem(item.id)
      setNotice('Custom grocery deleted.')
      setItems((current) => current.filter((entry) => entry.id !== item.id))
    } catch (caught) { setError(caught.message) }
  }

  async function add(item) {
    setError('')
    setNotice('')
    setAddingId(item.id)
    onAddPending(true)
    try {
      const result = await onAdd(item.id)
      if (result.created) setNotice(`${item.name} added to your shopping list.`)
    } catch (caught) {
      setError(`We could not add ${item.name} to your shopping list. ${caught.message}`)
    } finally { onAddPending(false); setAddingId(null) }
  }

  return <main className="catalog-main">
    {editor ? <>
      <div className="catalog-heading"><div><p className="catalog-eyebrow">REUSABLE ITEMS</p><h1>{editor.mode === 'create' ? 'Register custom grocery' : 'Edit catalog item'}</h1><p className="catalog-subtitle">{editor.mode === 'create' ? 'Add a grocery to your private catalog.' : 'Keep your private grocery catalog easy to search.'}</p></div><button className="catalog-button secondary" type="button" onClick={() => setEditor(null)} disabled={busy}>Cancel</button></div>
      <section className="catalog-panel"><form className="catalog-form" onSubmit={save}>
        <label htmlFor="grocery-name">Grocery name</label><input id="grocery-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required autoFocus />
        <label htmlFor="grocery-category">Category</label><select id="grocery-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value] || value}</option>)}</select>
        <p className="catalog-help">No prices are saved in your reusable catalog.</p>
        {formError && <p className="alert" role="alert">{formError}</p>}
        <div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={() => setEditor(null)} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editor.mode === 'create' ? 'Save custom item' : 'Save catalog item'}</button></div>
      </form></section>
    </> : <>
      <div className="catalog-heading"><div><p className="catalog-eyebrow">REUSABLE ITEMS</p><h1>Grocery catalog</h1><p className="catalog-subtitle">Find a familiar item or register a custom grocery.</p></div><button className="catalog-button primary" type="button" onClick={openCreate}>＋ Register custom item</button></div>
      <section className="catalog-panel catalog-tools" aria-label="Search and filter catalog"><label htmlFor="catalog-search">Search catalog</label><input id="catalog-search" type="search" placeholder="Try milk, rice, or soap" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /><div className="catalog-filters" aria-label="Filter by category"><button type="button" className={!category ? 'selected' : ''} aria-pressed={!category} onClick={() => setCategory('')}>All items</button>{CATEGORIES.map((value) => <button key={value} type="button" className={category === value ? 'selected' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{CATEGORY_LABELS[value] || value}</button>)}</div></section>
      <div className="catalog-section-heading"><div><h2>Common items</h2><p>No prices are shown for catalog items.</p></div><button type="button" className="catalog-button secondary" onClick={openCreate}>Register custom item</button></div>
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {error && <div className="catalog-state" role="alert"><p>{error}</p><button className="catalog-button secondary" type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {loading && <div className="catalog-state" role="status"><p>Loading your catalog…</p></div>}
      {!loading && !error && (items.length ? <div className="catalog-grid">{items.map((item) => <article className="catalog-item" key={item.id}><span className="catalog-icon" aria-hidden="true">{item.category.slice(0, 2).toUpperCase()}</span><span className="catalog-info"><strong>{item.name}</strong><small>{CATEGORY_LABELS[item.category] || item.category}{item.source === 'custom' ? ' · custom' : ''}</small></span><span className="catalog-actions">{item.source === 'custom' && <><button className="catalog-small-button" type="button" onClick={() => openEdit(item)}>Edit</button><button className="catalog-small-button" type="button" onClick={() => remove(item)}>Delete</button></>}<button className="catalog-small-button" type="button" onClick={() => add(item)} disabled={addingId !== null}>{addingId === item.id ? 'Adding…' : 'Add to list'}</button></span></article>)}</div> : <div className="catalog-state"><h2>{search.trim() ? `No matches for “${search.trim()}”` : 'No catalog items in this category'}</h2><p>Try another search, choose a category, or register a custom grocery.</p><button className="catalog-button secondary" type="button" onClick={openCreate}>Register a custom item</button></div>)}
    </>}
  </main>
}
