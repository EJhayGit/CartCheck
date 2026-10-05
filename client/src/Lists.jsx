import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createList, deleteList, getList, getLists, updateList } from './api/httpApi.js'
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

export default function Lists({ onOpenList, preferredCurrency = 'PHP' }) {
  const cache = useDataCache()
  const query = useDataQuery('lists', fetchLists)
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState(preferredCurrency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [deletingIds, setDeletingIds] = useState(() => new Set())
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
    setDialog({ mode: 'create' }); setName(''); setBudget(''); setCurrency(preferredCurrency); setError(''); setNotice('')
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
        const list = await createList({ name: normalizedName, budget: nextBudget, currency })
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
    if (!window.confirm(`Delete “${list.name}” and all its items? This cannot be undone. Trip history is unaffected.`)) return
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
    <div className="shopping-heading"><div><p className="catalog-eyebrow">YOUR SHOPPING</p><h1>My Lists</h1><p className="catalog-subtitle">Keep each shop organized in its own list.</p></div><button className="catalog-button primary" type="button" onClick={openCreate}>＋ Create list</button></div>
    {notice && <p className="catalog-notice" role="status">{notice}</p>}{error && !dialog && <p className="alert" role="alert">{error}</p>}
    {query.error && <section className="catalog-state" role="alert"><p>We could not load your lists. Check your connection and try again.</p><button className="catalog-button secondary" onClick={query.refresh}>Try again</button></section>}
    {query.loading && !lists.length && <section className="catalog-state" role="status">Loading your lists…</section>}
    {!query.loading && !lists.length && !query.error && <section className="catalog-state"><h2>No lists yet</h2><p>Create a list for your next grocery trip.</p><button className="catalog-button primary" type="button" onClick={openCreate}>Create your first list</button></section>}
    <div className="list-cards">{lists.map((list) => {
      const estimated = listAmount(list, 'estimated')
      const actual = listAmount(list, 'actual')
      const count = list.itemCount ?? 0
      const bought = list.boughtCount ?? 0
      const progress = count ? Math.round(bought / count * 100) : 0
      const amount = estimated.knownCount ? formatMoney(estimated.total, list.currency) : 'No prices entered'
      const recorded = actual.knownCount ? formatMoney(actual.total, list.currency) : 'No actual prices recorded'
      const budgetState = list.budget == null ? null : budgetProgress(list.budget, estimated)
      return <article className="list-card" key={list.id}>
        <button className="list-card-open" type="button" onClick={() => onOpenList(list.id)}><span className="catalog-eyebrow">{list.currency}</span><strong>{list.name}</strong><span>{bought} of {count} items purchased</span><span className="progress-track" role="img" aria-label={`${progress}% purchased`}><span style={{ width: `${progress}%` }} /></span><span className="list-card-budget">Estimated {amount}{estimated.missingCount > 0 ? ' · some prices missing' : ''}</span><span className="list-card-budget">Actual spending {recorded}{actual.missingCount > 0 ? ' · incomplete' : ''}</span><span className="list-card-budget">{list.budget == null ? 'No budget' : `Budget ${formatMoney(list.budget, list.currency)}${budgetState ? ` · ${budgetState.over ? 'over budget' : budgetState.reached ? 'reached' : `${formatMoney(budgetState.value, list.currency)} remaining`}` : ''}`}</span><span className="list-card-updated">Updated {dateLabel(list.updatedAt)}</span></button>
        <div className="list-card-actions"><button className="catalog-button secondary" type="button" onClick={(event) => openEdit(list, event)}>Rename or edit budget</button><button className="catalog-button secondary" type="button" onClick={() => remove(list)} disabled={deletingIds.has(String(list.id))}>{deletingIds.has(String(list.id)) ? 'Deleting…' : 'Delete'}</button></div>
      </article>
    })}</div>
    {pageError && <p className="alert" role="alert">{pageError}</p>}{query.data?.nextCursor && <button className="catalog-button secondary" type="button" onClick={loadMore} disabled={pageBusy}>{pageBusy ? 'Loading…' : 'Load more lists'}</button>}
    {dialog && createPortal(<div className="list-dialog-backdrop"><section ref={dialogRef} className="list-dialog catalog-panel" role="dialog" aria-modal="true" aria-labelledby="list-dialog-title"><form onSubmit={submit}><p className="catalog-eyebrow">MY LISTS</p><h2 id="list-dialog-title">{dialog.mode === 'create' ? 'Create a list' : 'Edit list'}</h2><label htmlFor="list-name">List name</label><input id="list-name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} required /><label htmlFor="list-budget">Budget (optional)</label><input id="list-budget" inputMode="decimal" placeholder="Leave blank for no budget" value={budget} onChange={(event) => setBudget(event.target.value)} /><label htmlFor="list-currency">Currency</label><select id="list-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={dialog.mode === 'edit'}><option value="PHP">PHP — Philippine peso</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — euro</option></select>{error && <p className="alert" role="alert">{error}</p>}<div className="catalog-form-actions"><button className="catalog-button secondary" type="button" onClick={closeDialog} disabled={busy}>Cancel</button><button className="catalog-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : dialog.mode === 'create' ? 'Create list' : 'Save changes'}</button></div></form></section></div>, document.body)}
  </main>
}
