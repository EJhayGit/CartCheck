import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createList, deleteList, getList, getLists, getTrips, reuseTrip, updateList } from './api/httpApi.js'
import { formatMoney, moneySummary, normalizeMoney, budgetProgress } from './money.js'
import { listSummary, removeListSummary, replaceListSummary } from './dataCache.js'
import { fetchLists, useDataCache, useDataQuery } from './dataCache.jsx'

const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Recently updated'

function listAmount(list, kind) {
  const total = list.summary?.[kind === 'actual' ? 'actualTotal' : 'estimatedTotal']
  const missing = list.summary?.[kind === 'actual' ? 'actualMissingCount' : 'estimatedMissingCount']
  if (total !== undefined) return { total, knownCount: total == null ? 0 : 1, missingCount: missing ?? 0 }
  return moneySummary(list.items || [])[kind]
}

export default function Lists({ onOpenList, onOpenTrip = onOpenList, preferredCurrency = 'PHP', flash = null }) {
  const cache = useDataCache()
  const query = useDataQuery('lists', fetchLists)
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState(preferredCurrency)
  const [startWith, setStartWith] = useState('empty')
  const tripsQuery = useDataQuery('trips', (signal) => getTrips(null, { signal }), { staleTime: 30000 })
  const lastTrip = tripsQuery.data?.items?.[0] || null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [deletingIds, setDeletingIds] = useState(() => new Set())
  const [confirmingId, setConfirmingId] = useState(null)
  // An element id to focus after the next render, for controls that replace one another.
  const focusTarget = useRef(null)
  useEffect(() => {
    const target = focusTarget.current && document.getElementById(focusTarget.current)
    if (target) { focusTarget.current = null; target.focus() }
  })
  const dialogRef = useRef(null)
  const dialogTriggerRef = useRef(null)
  const mounted = useRef(false)
  const lists = query.data?.items || []

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  function openCreate(event) {
    dialogTriggerRef.current = event?.currentTarget || null
    setDialog({ mode: 'create' }); setName(''); setBudget(''); setCurrency(preferredCurrency); setStartWith('empty'); setError(''); setNotice('')
  }

  function openEdit(list, event) {
    dialogTriggerRef.current = event?.currentTarget || null
    setDialog({ mode: 'edit', list }); setName(list.name); setBudget(list.budget ?? ''); setCurrency(list.currency || preferredCurrency); setError(''); setNotice('')
  }

  function closeDialog() {
    if (busy) return
    setDialog(null)
    requestAnimationFrame(() => dialogTriggerRef.current?.focus())
  }

  useEffect(() => {
    if (!dialog) return
    const appSurface = document.querySelector('.app')
    const wasInert = appSurface?.inert || false
    const oldAriaHidden = appSurface?.getAttribute('aria-hidden')
    if (appSurface) { appSurface.inert = true; appSurface.setAttribute('aria-hidden', 'true') }
    const surface = dialogRef.current
    surface?.querySelector('input')?.focus()
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return }
      if (event.key !== 'Tab') return
      const controls = [...surface.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      if (!controls.length) { event.preventDefault(); return }
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (appSurface) {
        appSurface.inert = wasInert
        if (oldAriaHidden === null) appSurface.removeAttribute('aria-hidden')
        else appSurface.setAttribute('aria-hidden', oldAriaHidden)
      }
    }
  }, [dialog, busy])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const normalizedName = name.trim()
    if (!normalizedName || Array.from(normalizedName).length > 100) { setError('Enter a name with 1 to 100 characters.'); return }
    let nextBudget
    try { nextBudget = normalizeMoney(budget) } catch (caught) { setError(caught.message); return }
    setBusy(true); setError(''); setNotice('')
    let release = null
    let releaseSummary = null
    let previousEdit = null
    let previousSummary = null
    let reconcileId = null
    try {
      if (dialog.mode === 'create') {
        // Starting from the last trip copies its items on the server; the budget is then set as usual.
        let list = startWith === 'empty' || !lastTrip
          ? await createList({ name: normalizedName, budget: nextBudget, currency })
          : await reuseTrip(lastTrip.id, { items: startWith, name: normalizedName })
        if (startWith !== 'empty' && lastTrip && nextBudget !== null) list = await updateList(list.tripId ?? list.id, { budget: nextBudget })
        if (!cache.alive) return
        cache.set(`list:${list.tripId ?? list.id}`, list)
        replaceListSummary(cache, list)
        if (!mounted.current) return
        setDialog(null)
        onOpenList(list.tripId ?? list.id)
      } else {
        const id = dialog.list.id
        previousEdit = cache.get(`list:${id}`).data
        previousSummary = cache.get('lists').data?.items.find((item) => String(item.id) === String(id))
        release = cache.beginMutation(`list:${id}`)
        releaseSummary = cache.beginMutation('lists')
        cache.set('lists', (current) => current && ({ ...current, items: current.items.map((item) => String(item.id) === String(id) ? { ...item, name: normalizedName, budget: nextBudget } : item) }))
        if (previousEdit) {
          const optimistic = { ...previousEdit, name: normalizedName, budget: nextBudget }
          cache.set(`list:${id}`, optimistic)
          replaceListSummary(cache, optimistic)
        }
        const result = await updateList(id, { name: normalizedName, budget: nextBudget })
        if (!cache.alive) return
        cache.set(`list:${id}`, result)
        replaceListSummary(cache, result)
        if (!mounted.current) return
        setDialog(null); setNotice('List details saved.')
        requestAnimationFrame(() => dialogTriggerRef.current?.focus())
      }
    } catch (caught) {
      if (!cache.alive) return
      if (dialog.mode === 'edit') {
        if (previousEdit) { cache.set(`list:${dialog.list.id}`, previousEdit); replaceListSummary(cache, previousEdit) }
        if (previousSummary) cache.set('lists', (current) => current && ({ ...current, items: current.items.map((item) => String(item.id) === String(dialog.list.id) ? { ...item, name: previousSummary.name, budget: previousSummary.budget } : item) }))
        reconcileId = dialog.list.id
      }
      if (mounted.current) setError(caught.message || 'We could not save this list.')
    } finally {
      release?.()
      releaseSummary?.()
      if (reconcileId && cache.alive) cache.load(`list:${reconcileId}`, (signal) => getList(reconcileId, { signal }), { force: true }).catch(() => {})
      if (mounted.current) setBusy(false)
    }
  }

  async function remove(list) {
    if (deletingIds.has(String(list.id))) return
    setConfirmingId(null)
    // The card disappears optimistically, so keep keyboard focus on the page.
    focusTarget.current = 'create-list'
    const key = String(list.id)
    const previousEntry = query.data?.items.find((entry) => String(entry.id) === key)
    const previousIndex = query.data?.items.findIndex((entry) => String(entry.id) === key) ?? 0
    const release = cache.beginMutation('lists')
    setDeletingIds((current) => new Set(current).add(key))
    cache.set('lists', (current) => current && ({ ...current, items: current.items.filter((entry) => String(entry.id) !== String(list.id)) }))
    try { await deleteList(list.id); cache.invalidate(`list:${list.id}`); setNotice(`${list.name} deleted.`) }
    catch (caught) {
      cache.set('lists', (current) => {
        if (!previousEntry) return current
        const currentItems = current?.items || []
        if (currentItems.some((entry) => String(entry.id) === key)) return current
        const restored = [...currentItems]
        restored.splice(Math.min(previousIndex, restored.length), 0, previousEntry)
        return { ...(current || { nextCursor: null }), items: restored }
      })
      setError(caught.message || 'We could not delete this list.')
    } finally {
      release()
      setDeletingIds((current) => { const next = new Set(current); next.delete(key); return next })
    }
  }

  async function loadMore() {
    const cursor = query.data?.nextCursor
    if (!cursor || pageBusy) return
    setPageBusy(true); setPageError('')
    try {
      const result = await getLists(cursor)
      if (!mounted.current || !cache.alive) return
      if (cache.get('lists').data?.nextCursor !== cursor) return
      const normalized = result.items.map(listSummary)
      cache.set('lists', (current) => current && ({ ...current, items: [...current.items, ...normalized.filter((entry) => !current.items.some((known) => String(known.id) === String(entry.id)))], nextCursor: result.nextCursor }))
    } catch (caught) { if (mounted.current && cache.alive) setPageError(caught.message || 'Could not load more lists.') }
    finally { if (mounted.current) setPageBusy(false) }
  }

  return <main className="shopping-main lists-screen">
    <div className="shopping-heading"><div><h1>My Lists</h1><p className="catalog-subtitle">Keep each shop organized in its own list.</p></div><button id="create-list" className="catalog-button primary" type="button" onClick={openCreate}>Create list</button></div>
    {flash && !notice && <p className="catalog-notice flash-notice" role="status"><span>{flash.notice}</span>{flash.tripId && <button className="text-button" type="button" onClick={() => onOpenTrip(flash.tripId)}>View trip</button>}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}{error && !dialog && <p className="alert" role="alert">{error}</p>}
    {query.error && <section className="catalog-state" role="alert"><p>We could not load your lists. Check your connection and try again.</p><button className="catalog-button secondary" onClick={query.refresh}>Try again</button></section>}
    {query.loading && !lists.length && <div className="list-cards" role="status"><span className="visually-hidden">Loading your lists…</span>{[0, 1].map((card) => <div className="list-card skeleton" key={card} aria-hidden="true"><div className="skeleton-row"><span /></div><div className="skeleton-row"><span /><span /></div></div>)}</div>}
    {!query.loading && !lists.length && !query.error && <section className="catalog-state"><h2>No lists yet</h2><p>Create a list for your next grocery trip.</p><button className="catalog-button primary" type="button" onClick={openCreate}>Create your first list</button></section>}
    <div className="list-cards">{lists.map((list) => {
      const estimated = listAmount(list, 'estimated')
      const actual = listAmount(list, 'actual')
      const count = list.itemCount ?? 0
      const bought = list.boughtCount ?? 0
      const progress = count ? Math.round(bought / count * 100) : 0
      const budgetState = list.budget == null ? null : budgetProgress(list.budget, estimated)
      // Money lines appear only once something is known; unknown is never shown as zero.
      const money = [
        estimated.knownCount ? `Estimated ${formatMoney(estimated.total, list.currency)}${estimated.missingCount > 0 ? ' (some prices missing)' : ''}` : '',
        actual.knownCount ? `Actual spending ${formatMoney(actual.total, list.currency)}${actual.missingCount > 0 ? ' · incomplete' : ''}` : '',
        list.budget == null ? '' : `Budget ${formatMoney(list.budget, list.currency)}${budgetState ? ` · ${budgetState.over ? 'over budget' : budgetState.reached ? 'reached' : `${formatMoney(budgetState.value, list.currency)} remaining`}${estimated.missingCount > 0 ? ' (known prices only)' : ''}` : ''}`,
      ].filter(Boolean)
      return <article className="list-card" key={list.id}>
        <button className="list-card-open" type="button" onClick={() => onOpenList(list.id)}><strong>{list.name}</strong><span>{count ? `${bought} of ${count} bought` : 'No items yet'}</span><span className="progress-track" role="img" aria-label={`${progress}% bought`}><span style={{ width: `${progress}%` }} /></span>{money.length ? money.map((line) => <span className="list-card-budget" key={line}>{line}</span>) : count > 0 && <span className="list-card-budget">No prices entered</span>}<span className="list-card-updated">{list.currency} · Updated {dateLabel(list.updatedAt)}</span></button>
        <div className="list-card-actions"><button className="catalog-button secondary" type="button" onClick={(event) => openEdit(list, event)}>Edit</button>{confirmingId === String(list.id)
          ? <p className="remove-confirm" role="group" aria-label={`Delete ${list.name}?`}><span>Delete “{list.name}” and its items? Trip history is unaffected.</span><button className="catalog-small-button" type="button" onClick={() => { setConfirmingId(null); focusTarget.current = `delete-list-${list.id}` }}>Keep</button><button className="catalog-small-button danger" type="button" onClick={() => remove(list)} autoFocus>Delete</button></p>
          : <button id={`delete-list-${list.id}`} className="text-button danger" type="button" onClick={() => setConfirmingId(String(list.id))} disabled={deletingIds.has(String(list.id))}>{deletingIds.has(String(list.id)) ? 'Deleting…' : 'Delete'}</button>}</div>
      </article>
    })}</div>
    {pageError && <p className="alert" role="alert">{pageError}</p>}{query.data?.nextCursor && <button className="catalog-button secondary" type="button" onClick={loadMore} disabled={pageBusy}>{pageBusy ? 'Loading…' : 'Load more lists'}</button>}
    {dialog && createPortal(<div className="list-dialog-backdrop"><section ref={dialogRef} className="list-dialog catalog-panel" role="dialog" aria-modal="true" aria-labelledby="list-dialog-title"><form onSubmit={submit}><h2 id="list-dialog-title">{dialog.mode === 'create' ? 'Create a list' : 'Edit list'}</h2><label htmlFor="list-name">List name</label><input id="list-name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required />{dialog.mode === 'create' && lastTrip && <><label htmlFor="list-start">Start with</label><select id="list-start" value={startWith} onChange={(event) => setStartWith(event.target.value)}><option value="empty">An empty list</option><option value="all">All {lastTrip.itemCount} items from “{lastTrip.name || 'your last trip'}”</option>{lastTrip.notBoughtCount > 0 && <option value="notBought">The {lastTrip.notBoughtCount} not bought on “{lastTrip.name || 'your last trip'}”</option>}</select></>}<label htmlFor="list-budget">Budget (optional)</label><input id="list-budget" inputMode="decimal" placeholder="Leave blank for no budget" value={budget} onChange={(event) => setBudget(event.target.value)} /><label htmlFor="list-currency">Currency</label><select id="list-currency" value={startWith !== 'empty' && dialog.mode === 'create' ? preferredCurrency : currency} onChange={(event) => setCurrency(event.target.value)} disabled={dialog.mode === 'edit' || startWith !== 'empty'} aria-describedby={startWith !== 'empty' && dialog.mode === 'create' ? 'list-currency-help' : undefined}><option value="PHP">PHP — Philippine peso</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — euro</option></select>{startWith !== 'empty' && dialog.mode === 'create' && <p id="list-currency-help" className="optional-help">Lists started from a trip use your preferred currency. Names, quantities and units carry over; prices and checkmarks start fresh.</p>}{error && <p className="alert" role="alert">{error}</p>}<div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={closeDialog} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : dialog.mode === 'create' ? 'Create list' : 'Save changes'}</button></div></form></section></div>, document.body)}
  </main>
}
