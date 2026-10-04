import { useMemo, useRef, useState } from 'react'
import { createCatalogItem, deleteCatalogItem, getCatalog, updateCatalogItem } from './api/httpApi.js'
import { useDataCache, useDataQuery } from './dataCache.jsx'

const CATEGORIES = ['Produce', 'Dairy & eggs', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Household', 'Other']
const CATEGORY_LABELS = { 'Dairy & eggs': 'Dairy', 'Meat & seafood': 'Meat & seafood' }
const EMPTY_ITEM = { name: '', category: 'Produce' }
const sortItems = (items) => [...items].sort((a, b) =>
  a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()) || Number(a.id) - Number(b.id))
const catalogItems = (data) => Array.isArray(data) ? data : data?.items || []

export default function Catalog({ onAdd, onAddPending, active = true }) {
  const cache = useDataCache()
  const catalogQuery = useDataQuery('catalog', (signal) => getCatalog({ signal }), { staleTime: Infinity, enabled: active })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [operationError, setOperationError] = useState('')
  const mutationBusyRef = useRef(false)
  const addBusyRef = useRef(false)

  const items = catalogItems(catalogQuery.data)
  // Normalize once per collection; keystrokes filter locally and never issue search requests.
  const indexedItems = useMemo(() => items.map((item) => ({
    item,
    name: item.name.toLocaleLowerCase(),
    categoryText: item.category.toLocaleLowerCase(),
  })), [items])
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return indexedItems.filter(({ item, name, categoryText }) =>
      (!term || name.includes(term) || categoryText.includes(term)) &&
      (!category || item.category === category)).map(({ item }) => item)
  }, [indexedItems, search, category])

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
    if (mutationBusyRef.current || addBusyRef.current) return
    mutationBusyRef.current = true
    setFormError('')
    setOperationError('')
    setBusy(true)
    onAddPending(true)
    let release = null
    let previous
    try {
      if (editor.mode === 'create' && cache.get('catalog').data === undefined) {
        await catalogQuery.refresh()
        if (cache.get('catalog').data === undefined) throw new Error('Load your catalog before saving a custom item.')
      }
      release = cache.beginMutation('catalog')
      previous = cache.get('catalog').data
      const input = { name: form.name.trim(), category: form.category }
      if (editor.mode === 'create') {
        const created = await createCatalogItem(input)
        // The server assigns identity; insert and sort only after it confirms the new item.
        cache.set('catalog', (current) => {
          const source = catalogItems(current ?? previous)
          return { ...(current && !Array.isArray(current) ? current : {}), items: sortItems([...source.filter((item) => item.id !== created.item.id), created.item]) }
        })
        setSearch(created.item.name)
        setCategory('')
      } else {
        const itemId = editor.id
        cache.set('catalog', (current) => {
          const source = catalogItems(current ?? previous)
          return { ...(current && !Array.isArray(current) ? current : {}), items: sortItems(source.map((item) => item.id === itemId ? { ...item, ...input } : item)) }
        })
        try {
          const updated = await updateCatalogItem(itemId, input)
          cache.set('catalog', (current) => {
            const source = catalogItems(current ?? previous)
            return { ...(current && !Array.isArray(current) ? current : {}), items: sortItems(source.map((item) => item.id === itemId ? updated.item : item)) }
          })
        } catch (caught) {
          cache.set('catalog', previous)
          throw caught
        }
      }
      setNotice(editor.mode === 'create' ? 'Custom grocery saved to your catalog.' : 'Catalog item updated.')
      setEditor(null)
    } catch (caught) {
      if (release) cache.invalidate('catalog')
      setFormError(caught.message)
    } finally {
      release?.()
      mutationBusyRef.current = false
      onAddPending(false)
      setBusy(false)
    }
  }

  async function remove(item) {
    if (mutationBusyRef.current || addBusyRef.current || !window.confirm(`Delete “${item.name}” from your catalog?`)) return
    mutationBusyRef.current = true
    setNotice('')
    setOperationError('')
    setBusy(true)
    onAddPending(true)
    const release = cache.beginMutation('catalog')
    const previous = cache.get('catalog').data
    cache.set('catalog', (current) => {
      const source = catalogItems(current ?? previous)
      return { ...(current && !Array.isArray(current) ? current : {}), items: source.filter((entry) => entry.id !== item.id) }
    })
    try {
      await deleteCatalogItem(item.id)
      setNotice('Custom grocery deleted.')
    } catch (caught) {
      cache.set('catalog', previous)
      cache.invalidate('catalog')
      setOperationError(`Could not delete ${item.name}. ${caught.message}`)
    } finally {
      release()
      mutationBusyRef.current = false
      onAddPending(false)
      setBusy(false)
    }
  }

  async function add(item) {
    if (mutationBusyRef.current || addBusyRef.current) return
    addBusyRef.current = true
    setNotice('')
    setOperationError('')
    setAddingId(item.id)
    onAddPending(true)
    try {
      const result = await onAdd(item.id)
      if (result?.created) setNotice(`${item.name} added to your shopping list.`)
    } catch (caught) {
      setOperationError(`We could not add ${item.name} to your shopping list. ${caught.message}`)
    } finally { addBusyRef.current = false; onAddPending(false); setAddingId(null) }
  }

  const queryError = catalogQuery.error && 'We could not load your catalog. Check your connection and try again.'
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
      <div className="catalog-section-heading"><div><h2>Common items</h2><p>No prices are shown for catalog items.</p></div><div><button type="button" className="catalog-button secondary" onClick={catalogQuery.refresh} disabled={catalogQuery.fetching}>Refresh</button> <button type="button" className="catalog-button secondary" onClick={openCreate}>Register custom item</button></div></div>
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {operationError && <p className="alert" role="alert">{operationError}</p>}
      {queryError && <div className="catalog-state" role="alert"><p>{queryError}</p><button className="catalog-button secondary" type="button" onClick={catalogQuery.refresh}>Try again</button></div>}
      {catalogQuery.loading && <div className="catalog-state" role="status"><p>Loading your catalog…</p></div>}
      {catalogQuery.fetching && !catalogQuery.loading && <p className="optional-help" role="status">Refreshing catalog…</p>}
      {!catalogQuery.loading && (visibleItems.length ? <div className="catalog-grid">{visibleItems.map((item) => <article className="catalog-item" key={item.id}><span className="catalog-icon" aria-hidden="true">{item.category.slice(0, 2).toUpperCase()}</span><span className="catalog-info"><strong>{item.name}</strong><small>{CATEGORY_LABELS[item.category] || item.category}{item.source === 'custom' ? ' · custom' : ''}</small></span><span className="catalog-actions">{item.source === 'custom' && <><button className="catalog-small-button" type="button" onClick={() => openEdit(item)} disabled={busy}>Edit</button><button className="catalog-small-button" type="button" onClick={() => remove(item)} disabled={busy}>Delete</button></>}<button className="catalog-small-button" type="button" onClick={() => add(item)} disabled={addingId !== null || busy}>{addingId === item.id ? 'Adding…' : 'Add to list'}</button></span></article>)}</div> : !catalogQuery.error && <div className="catalog-state"><h2>{search.trim() ? `No matches for “${search.trim()}”` : 'No catalog items in this category'}</h2><p>Try another search, choose a category, or register a custom grocery.</p><button className="catalog-button secondary" type="button" onClick={openCreate}>Register a custom item</button></div>)}
    </>}
  </main>
}
