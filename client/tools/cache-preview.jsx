import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import '../src/styles.css'

// Development-only transport: never connects to accounts, APIs, or a database.
let connection = 'normal'
const calls = []
const listeners = new Set()
const emit = () => { for (const listener of listeners) listener() }
let catalog = [
  { id: '1', name: 'Milk', category: 'Dairy & eggs', source: 'starter' },
  { id: '2', name: 'Rice', category: 'Pantry', source: 'starter' },
  { id: '3', name: 'Millet', category: 'Pantry', source: 'custom' },
]
let cart = { tripId: 'active', revision: 1, currency: 'PHP', budget: '1500.00', items: catalog.map((item) => ({ ...item, quantity: '1', unitLabel: 'pack', bought: false, estimatedTotal: '100.00', actualTotal: null })) }
const saved = { id: 'saved', completedAt: '2026-09-28T08:00:00Z', currency: 'PHP', revision: 1, items: [{ ...cart.items[0], bought: true, actualTotal: '95.00' }], itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary: { actualTotal: '95.00', estimatedTotal: '100.00', actualMissingCount: 0, estimatedMissingCount: 0 } }
const trips = [saved]
const copy = (value) => structuredClone(value)
function result(path, options) {
  const input = options.body ? JSON.parse(options.body) : {}
  const method = options.method || 'GET'
  if (path === '/api/auth/me') return { user: { id: 'fixture', email: 'shopper@example.test', preferred_currency: 'PHP', email_verified: true, verification_required: false } }
  if (path === '/api/cart' && method === 'GET') return copy(cart)
  if (path === '/api/cart' && method === 'PATCH') { cart.budget = input.budget; cart.revision++; return { budget: cart.budget } }
  if (path.startsWith('/api/cart/items/')) {
    const id = path.split('/').at(-1)
    if (method === 'DELETE') { cart.items = cart.items.filter((item) => item.id !== id); cart.revision++; return null }
    const item = cart.items.find((item) => item.id === id)
    Object.assign(item, input); cart.revision++; return { item: copy(item) }
  }
  if (path === '/api/cart/items') {
    let item = cart.items.find((entry) => entry.id === input.productId)
    const created = !item
    if (!item) { item = { ...catalog.find((entry) => entry.id === input.productId), quantity: '1', unitLabel: '', bought: false, estimatedTotal: null, actualTotal: null }; cart.items.push(item); cart.revision++ }
    return { item: copy(item), created }
  }
  if (path === '/api/catalog' && method === 'GET') return { items: copy(catalog) }
  if (path === '/api/catalog' && method === 'POST') { const item = { ...input, id: String(Date.now()), source: 'custom' }; catalog.push(item); return { item: copy(item) } }
  if (path.startsWith('/api/catalog/')) {
    const id = path.split('/').at(-1)
    if (method === 'DELETE') { catalog = catalog.filter((item) => item.id !== id); return null }
    const item = catalog.find((item) => item.id === id); Object.assign(item, input); return { item: copy(item) }
  }
  if (path === '/api/trips') return { items: copy(trips).map(({ items, ...summary }) => summary), nextCursor: null }
  if (path.startsWith('/api/trips/')) return { trip: copy(trips.find((trip) => trip.id === path.split('/').at(-1))) }
  if (path === '/api/auth/logout') return null
  throw new Error('This fixture does not implement that action.')
}
window.fetch = async (path, options = {}) => {
  const mode = connection
  calls.push(`${options.method || 'GET'} ${path}`); emit()
  if (mode === 'offline') throw new TypeError('Fixture is offline')
  if (mode === 'slow' || mode === 'fail') await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve() }, 3000)
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
  })
  if (mode === 'fail') return new Response(JSON.stringify({ error: 'Simulated server failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  try {
    const body = result(path, options)
    return body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
}
function Preview() {
  const [mode, setMode] = useState('normal')
  const [count, setCount] = useState(0)
  React.useEffect(() => { const listener = () => setCount(calls.length); listeners.add(listener); setCount(calls.length); return () => listeners.delete(listener) }, [])
  return <><aside style={{ padding: '12px 24px', background: '#fff', color: '#172b26', borderBottom: '1px solid #d7e2d9' }} aria-label="Local transport controls"><strong>Local fixtures</strong>{' '}<label htmlFor="fixture-network">Transport</label>{' '}<select id="fixture-network" value={mode} onChange={(event) => { connection = event.target.value; setMode(event.target.value) }}><option value="normal">Normal</option><option value="slow">3-second delay</option><option value="offline">Offline</option><option value="fail">Delayed 503 failure</option></select>{' '}<span role="status">{count} requests</span><details><summary>Request log</summary><pre>{calls.join('\n')}</pre></details></aside><App /></>
}
createRoot(document.getElementById('root')).render(<StrictMode><Preview /></StrictMode>)
