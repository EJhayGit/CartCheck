// Isolated local review server. Every /api request is handled here; no database,
// email provider, authentication service, or production endpoint is contacted.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const templates = [...readFileSync(new URL('../../server/db/seed.sql', import.meta.url), 'utf8').matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)]
  .map((match, index) => ({ id: String(index + 1), name: match[2], category: match[3], source: 'starter' }))
let catalog, cart, signedIn, delay, failNext, calls
function reset(params = new URLSearchParams()) {
  catalog = structuredClone(templates)
  const names = ['Milk', 'Rice', 'Eggs', 'Chicken', 'White bread', 'Apples', 'Bananas', 'Soy sauce', 'Vinegar', 'Cooking oil', 'Pechay', 'Pancit canton', 'Carrots', 'Tomatoes']
  const items = names.map((name, index) => ({ ...catalog.find((item) => item.name === name), id: String(1000 + index), quantity: '1', unitLabel: 'pack', bought: index < 3, estimatedTotal: index === 11 ? null : '100.00', actualTotal: index < 2 ? '95.00' : null }))
  const mode = params.get('budget') || 'under'
  const budget = { under: '2000.00', reached: '1300.00', over: '1150.00', none: null, zero: '0.00' }[mode]
  cart = { items, tripId: 'preview-trip', revision: 1, currency: params.get('currency') || 'PHP', budget }
  signedIn = params.get('auth') !== 'out'
  delay = Number(params.get('delay') || 0)
  failNext = false
  calls = []
}
reset()
const user = { id: 'preview-user', email: 'shopper@example.test', preferred_currency: 'PHP', email_verified: true, verification_required: false }
export default defineConfig({
  plugins: [react(), { name: 'isolated-ux-review', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      const send = (body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
      if (url.pathname === '/__preview/reset') { reset(url.searchParams); return send({ ready: true }) }
      if (url.pathname === '/__preview/state') return send({ cart, catalog, calls })
      if (url.pathname === '/__preview/fail-next') { failNext = true; return send({ ready: true }) }
      if (!url.pathname.startsWith('/api/')) return next()
      calls.push({ method: req.method, path: url.pathname })
      let input = {}
      if (req.method !== 'GET') {
        let body = ''
        for await (const part of req) body += part
        try { input = JSON.parse(body || '{}') } catch { return send({ error: 'Invalid fixture request' }, 400) }
      }
      if (req.method === 'PATCH' && delay) await new Promise((resolve) => setTimeout(resolve, delay))
      if (req.method === 'PATCH' && failNext) { failNext = false; return send({ error: 'Fixture persistence failure' }, 503) }
      if (url.pathname === '/api/auth/me') return signedIn ? send({ user }) : send({ error: 'Sign in required' }, 401)
      if (url.pathname === '/api/auth/logout') { signedIn = false; return send({}) }
      if (url.pathname === '/api/auth/verify-email') return send({ user })
      if (url.pathname === '/api/auth/forgot-password' || url.pathname === '/api/auth/resend-verification') return send({ message: 'Preview email confirmation. No email was sent.' })
      if (url.pathname === '/api/cart' && req.method === 'GET') return send(cart)
      if (url.pathname === '/api/cart' && req.method === 'PATCH') { cart.budget = input.budget; return send({ budget: cart.budget }) }
      if (url.pathname.startsWith('/api/cart/items/') && req.method === 'PATCH') {
        const item = cart.items.find((entry) => entry.id === url.pathname.split('/').at(-1))
        if (!item) return send({ error: 'Item not found' }, 404)
        Object.assign(item, input)
        cart.revision++
        return send({ item })
      }
      if (url.pathname === '/api/catalog') return send({ items: catalog })
      if (url.pathname.startsWith('/api/catalog/') && req.method === 'PATCH') {
        const item = catalog.find((entry) => entry.id === url.pathname.split('/').at(-1))
        if (!item) return send({ error: 'Item not found' }, 404)
        Object.assign(item, input)
        return send({ item })
      }
      if (url.pathname === '/api/trips') return send({ items: [{ id: 'preview-past', completedAt: '2026-10-01T08:00:00Z', currency: 'PHP', itemCount: 12, boughtCount: 3, notBoughtCount: 9, summary: { actualTotal: '190.00', actualMissingCount: 1 } }], nextCursor: null })
      return send({ error: 'This fixture action is not implemented.' }, 400)
    })
  } }],
  server: { host: '127.0.0.1', port: 4176, strictPort: true, fs: { allow: ['..'] }, hmr: false },
})
