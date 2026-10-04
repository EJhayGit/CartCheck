import { useEffect, useMemo, useRef, useState } from 'react'
import { correctTrip, getTrip, getTrips } from './api/httpApi.js'
import { useDataCache, useDataQuery } from './dataCache.jsx'
import { mergeHistoryPage } from './dataCache.js'
import { formatMoney, moneySummary } from './money.js'
import { prepareCorrectionItems } from './tripCorrections.js'

const blankItem = () => ({ id: null, name: '', category: 'Other', quantity: '1', unitLabel: '', estimatedTotal: '', actualTotal: '', bought: false })
const dateLabel = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(value))
const amount = (value, currency) => value == null ? 'Not recorded' : formatMoney(value, currency)
const quantity = (item) => `${item.quantity}${item.unitLabel ? ` ${item.unitLabel}` : ''}`
const itemDraft = (item) => ({ ...item, unitLabel: item.unitLabel ?? '', estimatedTotal: item.estimatedTotal ?? '', actualTotal: item.actualTotal ?? '' })

function Summary({ trip }) {
  const summary = trip.summary
  return <div className="trip-summary"><div><span>Recorded spending</span><strong>{summary.actualTotal === null ? 'Not recorded' : amount(summary.actualTotal, trip.currency)}</strong><small>{summary.actualMissingCount ? `Partial total · ${summary.actualMissingCount} actual price${summary.actualMissingCount === 1 ? '' : 's'} missing` : 'Bought items with known actual prices'}</small></div><div><span>Known estimated total</span><strong>{amount(summary.estimatedTotal, trip.currency)}</strong><small>{summary.estimatedMissingCount} estimated price{summary.estimatedMissingCount === 1 ? '' : 's'} missing</small></div></div>
}

function TripRows({ items, currency }) {
  if (!items.length) return <p className="optional-help">No items in this group.</p>
  return <ul className="trip-review-list">{items.map((item, index) => <li key={item.id ?? `new-${index}`}><span><strong>{item.name}</strong><small>{item.category} · {quantity(item)} · Estimate: {amount(item.estimatedTotal === '' ? null : item.estimatedTotal, currency)} · Actual: {amount(item.actualTotal === '' ? null : item.actualTotal, currency)}</small></span><span className="trip-status">{item.bought ? 'BOUGHT' : 'NOT BOUGHT'}</span></li>)}</ul>
}

export default function Trips({ onReviewChange }) {
  const cache = useDataCache()
  const tripsQuery = useDataQuery('trips', async (signal) => {
    const fresh = await getTrips(null, { signal })
    const old = cache.get('trips').data
    return mergeHistoryPage(old, fresh)
  }, { staleTime: 30000 })
  const [selectedId, setSelectedId] = useState(null)
  const detailQuery = useDataQuery(selectedId ? `trip:${selectedId}` : 'trip:none', (signal) => getTrip(selectedId, { signal }), { staleTime: Infinity, enabled: selectedId !== null })
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [detailReloading, setDetailReloading] = useState(false)
  const [correctionRevision, setCorrectionRevision] = useState(null)
  const [mode, setMode] = useState('history')
  const [draft, setDraft] = useState([])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const headingRef = useRef(null)
  const reviewSurfaceRef = useRef(null)
  const reviewTriggerRef = useRef(null)
  const mountedRef = useRef(true)
  const viewRevision = useRef(0)
  const pageBusyRef = useRef(false)
  const detailReloadRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; viewRevision.current += 1 }
  }, [])

  // The shared trips entry aggregates every summary page already loaded.
  const trips = useMemo(() => tripsQuery.data?.items || [], [tripsQuery.data])
  const cursor = tripsQuery.data?.nextCursor ?? null
  const selected = detailQuery.data?.trip || null
  const loading = tripsQuery.loading
  const error = tripsQuery.error
  const detailLoading = detailQuery.loading
  const detailError = detailQuery.error
  useEffect(() => { headingRef.current?.focus() }, [mode, selected?.id])
  useEffect(() => { onReviewChange(mode === 'review'); return () => onReviewChange(false) }, [mode, onReviewChange])
  useEffect(() => {
    if (mode !== 'review') return
    function handleReviewKey(event) {
      if (event.key === 'Escape' && !saving) { setMode('edit'); requestAnimationFrame(() => reviewTriggerRef.current?.focus()) }
      if (event.key !== 'Tab') return
      const controls = [...reviewSurfaceRef.current.querySelectorAll('button:not(:disabled)')]
      if (!controls.length) { event.preventDefault(); headingRef.current?.focus(); return }
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleReviewKey)
    return () => document.removeEventListener('keydown', handleReviewKey)
  }, [mode, saving])

  async function loadTrips(next = null) {
    if (!next) { await tripsQuery.refresh(); return }
    if (pageBusyRef.current) return
    pageBusyRef.current = true
    setPageLoading(true)
    setPageError('')
    const key = `trips:page:${next}`
    try {
      const result = await cache.load(key, (signal) => getTrips(next, { signal }), { staleTime: 30000 })
      cache.set('trips', (current) => {
        if (!current || !result || current.nextCursor !== next) return current
        const ids = new Set((current.items || []).map((trip) => String(trip.id)))
        return { ...current, items: [...(current.items || []), ...(result?.items || []).filter((trip) => !ids.has(String(trip.id)))], nextCursor: result?.nextCursor ?? null, hasLoadedTail: true }
      })
    } catch (caught) {
      if (mountedRef.current) setPageError(caught.message || 'Could not load more trip history.')
    } finally {
      pageBusyRef.current = false
      if (mountedRef.current) setPageLoading(false)
    }
  }

  function openTrip(id) {
    viewRevision.current += 1
    setSelectedId(id)
    setNotice('')
    setMode('details')
  }

  function beginCorrection() {
    if (!selected) return
    setDraft(selected.items.map(itemDraft))
    setCorrectionRevision(selected.revision)
    setFormError('')
    setMode('edit')
  }

  function change(index, field, value) {
    setDraft((current) => current.map((item, position) => position === index ? { ...item, [field]: value } : item))
    setFormError('')
  }

  function reviewCorrection(event) {
    event.preventDefault()
    try {
      const prepared = prepareCorrectionItems(draft)
      setDraft(prepared)
      setMode('review')
      setFormError('')
    } catch (caught) { setFormError(caught.message) }
  }

  async function saveCorrection() {
    if (saving || !selected || correctionRevision === null) return
    setSaving(true)
    setFormError('')
    const tripId = selected.id
    const revision = viewRevision.current
    const release = cache.beginMutation(`trip:${tripId}`)
    const releaseSummaries = cache.beginMutation('trips')
    try {
      const result = await correctTrip(tripId, { revision: correctionRevision, items: draft.map(({ id, name, category, quantity, unitLabel, estimatedTotal, actualTotal, bought }) => ({ ...(id ? { id } : {}), name, category, quantity, unitLabel, estimatedTotal, actualTotal, bought })) })
      if (!mountedRef.current || revision !== viewRevision.current) return
      cache.set(`trip:${tripId}`, result)
      const boughtCount = result.trip.items.filter((item) => item.bought).length
      const summary = { ...result.trip, items: undefined, itemCount: result.trip.items.length, boughtCount, notBoughtCount: result.trip.items.length - boughtCount }
      const updateSummary = (current) => {
        if (!current) return current
        return { ...current, items: (current.items || []).map((trip) => trip.id === tripId ? summary : trip) }
      }
      cache.set('trips', updateSummary)
      setNotice('Trip corrections saved. The original finish date and currency are unchanged.')
      setMode('details')
    } catch (caught) {
      if (!mountedRef.current || revision !== viewRevision.current) return
      setFormError(caught.status === 409 ? 'This trip changed since you opened it. Reload its details before correcting it again.' : caught.status ? (caught.message || 'Could not save the correction. Your edits are still here.') : 'Connection lost. We could not confirm whether these changes were saved. Reload trip details before trying again.')
    } finally {
      release()
      releaseSummaries()
      if (mountedRef.current && revision === viewRevision.current) setSaving(false)
    }
  }

  async function reloadTripDetails() {
    const tripId = selectedId
    if (!tripId || detailReloadRef.current) return
    detailReloadRef.current = true
    setDetailReloading(true)
    try {
      await cache.load(`trip:${tripId}`, (signal) => getTrip(tripId, { signal }), { force: true })
      if (mountedRef.current && selectedId === tripId) {
        setCorrectionRevision(null)
        setDraft([])
        setFormError('')
        setMode('details')
      }
    } catch (caught) {
      if (mountedRef.current) setFormError(`Could not reload trip details. Your edits are still here. ${caught.message || 'Try again when connected.'}`)
    } finally {
      if (mountedRef.current) setDetailReloading(false)
      detailReloadRef.current = false
    }
  }

  const queryErrorText = (caught) => caught?.message || 'Could not load trip history.'
  if (mode === 'history') return <main className="shopping-main trip-screen"><div className="shopping-heading"><div><p className="catalog-eyebrow">YOUR SHOPPING</p><h1 ref={headingRef} tabIndex="-1">Trip history</h1><p className="catalog-subtitle">Review what you bought and what was left behind.</p></div><span className="currency-label">{trips.length} TRIPS</span></div>
    {notice && <p role="status" className="catalog-notice">{notice}</p>}{detailError && <p role="alert" className="alert">{detailError.message || 'Could not load this trip.'}</p>}{error && <div className="catalog-state" role="alert"><p>{queryErrorText(error)}</p><button type="button" className="catalog-button secondary" onClick={() => loadTrips()}>Try again</button></div>}{loading && !trips.length && <div className="catalog-state" role="status">Loading trip history…</div>}{!loading && !error && !trips.length && <section className="catalog-state"><h2>No finished trips yet</h2><p>Completed shopping trips will appear here after you finish a list.</p></section>}
    {pageError && <div className="catalog-state" role="alert"><p>{pageError}</p><button type="button" className="catalog-button secondary" onClick={() => loadTrips(cursor)} disabled={pageLoading}>Try again</button></div>}
    <div className="trip-cards">{trips.map((trip) => <article className="trip-card" key={trip.id}><div><p className="catalog-eyebrow">{dateLabel(trip.completedAt)}</p><h2>Shopping trip</h2><p>{trip.itemCount} items · {trip.boughtCount} bought · {trip.notBoughtCount} not bought</p></div><div className="trip-card-spend"><span>Recorded spending</span><strong>{amount(trip.summary.actualTotal, trip.currency)}</strong><small>{trip.summary.actualMissingCount ? `Partial total · ${trip.summary.actualMissingCount} prices missing` : 'Actual prices recorded'}</small></div><button className="catalog-button secondary" type="button" onClick={() => openTrip(trip.id)} disabled={detailLoading}>View details</button></article>)}</div>{cursor && <button type="button" className="catalog-button secondary" onClick={() => loadTrips(cursor)} disabled={loading || pageLoading}>{pageLoading ? 'Loading…' : 'Load more trips'}</button>}
  </main>

  if (!selected) return <main className="shopping-main trip-screen"><div className="shopping-heading"><div><p className="catalog-eyebrow">TRIP HISTORY</p><h1 ref={headingRef} tabIndex="-1">Shopping trip</h1><p className="catalog-subtitle">{detailError ? (detailError.message || 'Could not load this trip.') : 'Loading saved trip details…'}</p></div><button type="button" className="catalog-button secondary" onClick={() => { viewRevision.current += 1; setMode('history'); setSelectedId(null) }}>Back to history</button></div>{detailError && <section className="catalog-state" role="alert"><p>{detailError.message || 'Could not load this trip.'}</p><button className="catalog-button secondary" type="button" onClick={detailQuery.refresh}>Try again</button></section>}</main>
  const date = dateLabel(selected.completedAt)
  if (mode === 'details') return <main className="shopping-main trip-screen"><div className="shopping-heading"><div><p className="catalog-eyebrow">TRIP HISTORY</p><h1 ref={headingRef} tabIndex="-1">Shopping trip</h1><p className="catalog-subtitle">Original finish date: {date} · {selected.currency}</p></div><button type="button" className="catalog-button secondary" onClick={() => { viewRevision.current += 1; setMode('history'); setSelectedId(null) }} disabled={detailReloading}>Back to history</button></div>{notice && <p role="status" className="catalog-notice">{notice}</p>}{detailError && <p role="alert" className="alert">Could not refresh this trip. Showing the saved details. {detailError.message} <button type="button" className="catalog-button secondary" onClick={detailQuery.refresh}>Try again</button></p>}<section className="catalog-panel"><div className="trip-panel-heading"><div><h2>Trip items</h2><p>{selected.items.filter((item) => item.bought).length} bought · {selected.items.filter((item) => !item.bought).length} not bought</p></div><button type="button" className="catalog-button primary" onClick={beginCorrection}>Correct trip</button></div><h3>Bought</h3><TripRows items={selected.items.filter((item) => item.bought)} currency={selected.currency} /><h3>Not bought</h3><TripRows items={selected.items.filter((item) => !item.bought)} currency={selected.currency} /></section><section className="catalog-panel trip-totals"><h2>Trip totals · {selected.currency}</h2><Summary trip={selected} /></section></main>

  if (mode === 'edit') return <main className="shopping-main trip-screen"><div className="shopping-heading"><div><p className="catalog-eyebrow">CORRECT SAVED TRIP</p><h1 ref={headingRef} tabIndex="-1">Correct trip</h1><p className="catalog-subtitle">Edit the saved snapshot. Its original date stays {date}.</p></div><span className="currency-label">{selected.currency}</span></div><form className="catalog-panel" onSubmit={reviewCorrection}><h2>Trip details</h2><p className="optional-help">Add, remove, or correct items in this completed trip. Your reusable catalog stays the same.</p>{draft.map((item, index) => <fieldset className="trip-edit-item" key={item.id ?? `new-${index}`}><legend>{item.name || 'New item'}</legend><label>Item name<input value={item.name} onChange={(event) => change(index, 'name', event.target.value)} maxLength={120} required /></label><label>Category<input value={item.category} onChange={(event) => change(index, 'category', event.target.value)} maxLength={80} required /></label><div className="quantity-fields"><label>Quantity<input inputMode="decimal" value={item.quantity} onChange={(event) => change(index, 'quantity', event.target.value)} required /></label><label>Unit (optional)<input value={item.unitLabel} onChange={(event) => change(index, 'unitLabel', event.target.value)} maxLength={24} /></label></div><div className="quantity-fields"><label>Estimated item total (optional)<input inputMode="decimal" placeholder="Unknown" value={item.estimatedTotal ?? ''} onChange={(event) => change(index, 'estimatedTotal', event.target.value)} /></label><label>Actual item total (optional)<input inputMode="decimal" placeholder="Unknown" value={item.actualTotal ?? ''} onChange={(event) => change(index, 'actualTotal', event.target.value)} /></label></div><label className="trip-check"><input type="checkbox" checked={item.bought} onChange={(event) => change(index, 'bought', event.target.checked)} /> Mark as bought</label><button className="catalog-button secondary" type="button" onClick={() => setDraft((current) => current.filter((_, position) => position !== index))}>Remove {item.name || 'item'}</button></fieldset>)}<p className="optional-help">Blank prices remain unknown. Enter 0 to record a free item.</p><button className="catalog-button secondary" type="button" onClick={() => setDraft((current) => [...current, blankItem()])}>Add missing item</button>{formError && <p className="alert" role="alert">{formError}</p>}<div className="trip-actions"><button className="catalog-button secondary" type="button" onClick={() => setMode('details')}>Cancel</button><button ref={reviewTriggerRef} className="catalog-button primary" type="submit">Review corrections</button></div></form></main>

  const preview = moneySummary(draft)
  return <main className="shopping-main trip-screen" ref={reviewSurfaceRef}><div className="shopping-heading"><div><p className="catalog-eyebrow">CONFIRM CORRECTION</p><h1 ref={headingRef} tabIndex="-1">Save these trip changes?</h1><p className="catalog-subtitle">The corrected snapshots will replace the saved entries. The finish date stays {date}; currency remains {selected.currency}.</p></div></div><section className="catalog-panel"><h2>Bought</h2><TripRows items={draft.filter((item) => item.bought)} currency={selected.currency} /><h2>Not bought</h2><TripRows items={draft.filter((item) => !item.bought)} currency={selected.currency} /><p className="optional-help">Recorded spending: {preview.actual.knownCount ? amount(preview.actual.total, selected.currency) : 'Not recorded'} · {preview.actual.missingCount} actual prices missing.</p>{formError && <p className="alert" role="alert">{formError}</p>}<div className="trip-actions"><button className="catalog-button secondary" type="button" onClick={() => { setMode('edit'); requestAnimationFrame(() => reviewTriggerRef.current?.focus()) }} disabled={saving || detailReloading}>Keep editing</button>{formError && <button className="catalog-button secondary" type="button" onClick={reloadTripDetails} disabled={saving || detailReloading}>{detailReloading ? 'Reloading…' : 'Reload trip details'}</button>}<button className="catalog-button primary" type="button" onClick={saveCorrection} disabled={saving || detailReloading}>{saving ? 'Saving corrections…' : 'Confirm changes'}</button></div></section></main>
}
