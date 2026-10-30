import { useEffect, useMemo, useRef, useState } from 'react'
import { createCatalogItem, deleteCatalogItem, getCatalog, getList, getLists, updateCatalogItem } from './api/httpApi.js'
import { fetchLists, useDataCache, useDataQuery } from './dataCache.jsx'
import { listSummary } from './dataCache.js'

const CATEGORIES = ['Produce', 'Dairy & eggs', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Household', 'Other']
const CATEGORY_LABELS = { 'Dairy & eggs': 'Dairy', 'Meat & seafood': 'Meat & seafood' }
const EMPTY_ITEM = { name: '', category: 'Produce' }
const DESTINATION_KEY = 'cartcheck:catalog-destination'
const sortItems = (items) => [...items].sort((a, b) =>
  a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()) || Number(a.id) - Number(b.id))
const catalogItems = (data) => Array.isArray(data) ? data : data?.items || []

export default function Catalog({ onAdd, onAddPending, active = true, destinationId = null, onManageLists, onOpenList, initialSearch = '' }) {
  const cache = useDataCache()
  const catalogQuery = useDataQuery('catalog', (signal) => getCatalog({ signal }), { staleTime: Infinity, enabled: active })
  const listsQuery = useDataQuery('lists', fetchLists, { enabled: active })
  const [search, setSearch] = useState(initialSearch)
  const [category, setCategory] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [selectedDestination, setSelectedDestination] = useState(() => {
    if (destinationId) return destinationId
    try { return window.localStorage.getItem(DESTINATION_KEY) || '' } catch { return '' }
  })
  const [operationError, setOperationError] = useState('')
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [added, setAdded] = useState({ count: 0, last: '' })
  // A remembered list may have been deleted or finished since; only use it while it is still listed.
  const listedDestination = !selectedDestination || !listsQuery.data || listsQuery.data.items.some((list) => String(list.tripId ?? list.id) === String(selectedDestination)) ? selectedDestination : ''
  const destination = destinationId || listedDestination
  const destinationQuery = useDataQuery(`list:${destination || 'none'}`, (signal) => getList(destination, { signal }), { enabled: active && Boolean(destination) })
  const mutationBusyRef = useRef(false)
  const addBusyRef = useRef(false)
  const pageBusyRef = useRef(false)
  const pageSessionRef = useRef(0)
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    const session = ++pageSessionRef.current
    return () => {
      mountedRef.current = false
      if (pageSessionRef.current === session) pageSessionRef.current += 1
    }
  }, [])
  useEffect(() => { if (destinationId) setSelectedDestination(String(destinationId)) }, [destinationId])

  async function loadMoreLists() {
    const cursor = listsQuery.data?.nextCursor
    if (!cursor || pageBusyRef.current) return
    pageBusyRef.current = true
    const session = pageSessionRef.current
    setPageBusy(true)
    setPageError('')
    try {
      const result = await getLists(cursor)
      if (!mountedRef.current || pageSessionRef.current !== session || !cache.alive) return
      if (cache.get('lists').data?.nextCursor !== cursor) return
      const normalized = result.items.map(listSummary)
      cache.set('lists', (current) => current && ({
        ...current,
        items: [...current.items, ...normalized.filter((entry) => !current.items.some((known) => String(known.id) === String(entry.id)))],
        nextCursor: result.nextCursor,
      }))
    } catch (caught) {
      if (mountedRef.current && pageSessionRef.current === session && cache.alive && cache.get('lists').data?.nextCursor === cursor) {
        setPageError(caught.message || 'Could not load more lists.')
      }
    } finally {
      if (mountedRef.current && pageSessionRef.current === session) setPageBusy(false)
      pageBusyRef.current = false
    }
  }

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
    setEditor({ mode: 'edit', id: item.id, starter: item.source === 'starter' })
    setConfirmDelete(false)
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
    if (mutationBusyRef.current || addBusyRef.current) return
    mutationBusyRef.current = true
    setEditor(null)
    setConfirmDelete(false)
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
      if (!destination) { setOperationError('Choose a list before adding this item.'); return }
      const result = await onAdd(item.id, destination)
      if (result?.created && mountedRef.current) setAdded((current) => ({ count: current.count + 1, last: item.name }))
    } catch (caught) {
      setOperationError(`We could not add ${item.name} to your shopping list. ${caught.message}`)
    } finally { addBusyRef.current = false; onAddPending(false); setAddingId(null) }
  }

  const queryError = catalogQuery.error && 'We could not load your catalog. Check your connection and try again.'
  const destinationName = listsQuery.data?.items?.find((list) => String(list.tripId ?? list.id) === String(destination))?.name || 'your list'
  const onList = new Set((destinationQuery.data?.items || []).map((entry) => String(entry.productId)))
  const editing = editor?.mode === 'edit' ? items.find((item) => item.id === editor.id) : null
  return <main className={`catalog-main${added.count ? ' has-added-bar' : ''}`}>
    {editor ? <>
      <div className="catalog-heading"><div><h1>{editor.mode === 'create' ? 'New catalog item' : editor.starter ? 'Customize item' : 'Edit catalog item'}</h1><p className="catalog-subtitle">{editor.mode === 'create' ? 'Add a grocery to your private catalog.' : editor.starter ? 'Edit your own catalog copy. The shared starter and existing trip items stay unchanged.' : 'Keep your private grocery catalog easy to search.'}</p></div></div>
      <section className="catalog-panel"><form className="catalog-form" onSubmit={save}>
        <label htmlFor="grocery-name">Grocery name</label><input id="grocery-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required autoFocus />
        <label htmlFor="grocery-category">Category</label><select id="grocery-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value] || value}</option>)}</select>
        <p className="catalog-help">No prices are saved in your reusable catalog.</p>
        {formError && <p className="alert" role="alert">{formError}</p>}
        <div className="row-editor-actions">
          {editing?.source === 'custom' && (confirmDelete
            ? <p className="remove-confirm" role="group" aria-label={`Delete ${editing.name}?`}><span>Delete from your catalog?</span><button className="catalog-small-button" type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep</button><button className="catalog-small-button danger" type="button" onClick={() => remove(editing)} disabled={busy} autoFocus>Delete</button></p>
            : <button className="text-button danger" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete item</button>)}
          <span className="row-editor-save"><button className="catalog-button secondary" type="button" onClick={() => setEditor(null)} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editor.mode === 'create' ? 'Save custom item' : editor.starter ? 'Save my customization' : 'Save catalog item'}</button></span>
        </div>
      </form></section>
    </> : <>
      <div className="catalog-heading"><div><h1>Catalog</h1><p className="catalog-subtitle">Your reusable groceries. Catalog items never carry prices.</p></div><button className="catalog-button secondary" type="button" onClick={openCreate}>New item</button></div>
      {destinationId ? <p className="catalog-notice catalog-destination">Adding to <strong>{destinationName}</strong></p> : <section className="catalog-panel catalog-tools catalog-destination-select"><label htmlFor="catalog-destination">Add items to</label>{listsQuery.data?.items?.length ? <><select id="catalog-destination" value={listedDestination} onChange={(event) => { setSelectedDestination(event.target.value); setAdded({ count: 0, last: '' }); try { window.localStorage.setItem(DESTINATION_KEY, event.target.value) } catch { /* Storage is optional. */ } }}><option value="">Choose a list</option>{listsQuery.data.items.map((list) => <option key={list.tripId ?? list.id} value={list.tripId ?? list.id}>{list.name}</option>)}</select>{listsQuery.data?.nextCursor && <button className="catalog-button secondary" type="button" onClick={loadMoreLists} disabled={pageBusy}>{pageBusy ? 'Loading…' : 'Load more lists'}</button>}</> : <><p className="optional-help">Create a list before adding groceries.</p><button className="catalog-button secondary" type="button" onClick={onManageLists}>Go to My Lists</button></>}{pageError && <p className="alert" role="alert">{pageError}</p>}</section>}
      <section className="catalog-tools" aria-label="Search and filter catalog"><label htmlFor="catalog-search">Search catalog</label><input id="catalog-search" type="search" placeholder="Try milk, rice, or soap" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /><div className="catalog-filters" role="group" aria-label="Filter by category"><button type="button" className={!category ? 'selected' : ''} aria-pressed={!category} onClick={() => setCategory('')}>All</button>{CATEGORIES.map((value) => <button key={value} type="button" className={category === value ? 'selected' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{CATEGORY_LABELS[value] || value}</button>)}</div></section>
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {operationError && <p className="alert" role="alert">{operationError}</p>}
      {queryError && <div className="catalog-state" role="alert"><p>{queryError}</p><button className="catalog-button secondary" type="button" onClick={catalogQuery.refresh}>Try again</button></div>}
      {catalogQuery.loading && <div className="catalog-state" role="status"><p>Loading your catalog…</p></div>}
      {!catalogQuery.loading && !queryError && <div className="catalog-results-heading"><h2>{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}</h2><button type="button" className="text-button" onClick={catalogQuery.refresh} disabled={catalogQuery.fetching}>{catalogQuery.fetching ? 'Refreshing…' : 'Refresh catalog'}</button></div>}
      {!catalogQuery.loading && (visibleItems.length ? <div className="catalog-grid">{visibleItems.map((item) => {
        const listed = onList.has(String(item.id))
        return <article className={`catalog-item${listed ? ' is-listed' : ''}`} key={item.id}><span className="catalog-info"><strong>{item.name}</strong><small>{CATEGORY_LABELS[item.category] || item.category}{item.source === 'custom' ? ' · custom' : ''}{listed ? ' · on this list' : ''}</small></span><span className="catalog-actions"><button className="text-button" type="button" onClick={() => openEdit(item)} disabled={busy} aria-label={`${item.source === 'starter' ? 'Customize' : 'Edit'} ${item.name}`}>{item.source === 'starter' ? 'Customize' : 'Edit'}</button><button className={`catalog-small-button${listed ? '' : ' add'}`} type="button" onClick={() => add(item)} disabled={addingId !== null || busy || !destination} aria-label={addingId === item.id ? undefined : `${listed ? 'Change amount of' : 'Add'} ${item.name}`}>{addingId === item.id ? 'Adding…' : listed ? 'Change' : 'Add'}</button></span></article>
      })}</div> : !catalogQuery.error && <div className="catalog-state"><h2>{search.trim() ? `No matches for “${search.trim()}”` : 'No catalog items in this category'}</h2><p>Try another search or category, or create it as a new item.</p><button className="catalog-button secondary" type="button" onClick={openCreate}>{search.trim() ? `Create “${search.trim().slice(0, 40)}”` : 'New item'}</button></div>)}
      {added.count > 0 && <div className="added-bar" role="status"><p><strong>{added.count} added</strong> to {destinationName}{added.last ? <span className="added-last"> · {added.last}</span> : ''}</p>{onOpenList && <button className="catalog-button primary" type="button" onClick={() => onOpenList(destination)}>Back to list</button>}</div>}
    </>}
  </main>
}
