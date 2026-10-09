const BASE = import.meta.env.VITE_API_BASE_URL || ''
let expectedAccountId = null

// Private API calls carry the identity the UI was rendered for. The server
// checks it against the cookie session before serving data or accepting a
// mutation, closing the gap when another tab changes the shared cookie.
export function setExpectedAccountId(id) {
  expectedAccountId = id == null ? null : String(id)
}

function reportSessionBoundary(path, status, code) {
  if (path.startsWith('/api/auth/') && path !== '/api/auth/change-password') return
  if (status !== 401 && code !== 'SESSION_MISMATCH') return
  if (typeof window !== 'undefined') window.dispatchEvent(new window.CustomEvent('cartcheck:session-invalid'))
}

async function request(path, options = {}) {
  const privateRequest = (path.startsWith('/api/') && !path.startsWith('/api/auth/')) || path === '/api/auth/change-password'
  const requestAccountId = privateRequest ? expectedAccountId : null
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (privateRequest && expectedAccountId) headers['X-Expected-Account-Id'] = expectedAccountId
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Could not connect to the server. Please try again.')
  }
  if (privateRequest && requestAccountId !== expectedAccountId) {
    throw new DOMException('Session identity changed', 'AbortError')
  }
  if (!response.ok) {
    let message = response.status >= 500
      ? 'The server is unavailable. Please try again.'
      : `${response.status} ${response.statusText}`
    let code
    try {
      const body = await response.json()
      if (body?.error) message = body.error
      code = body?.code
    } catch { /* Keep the HTTP status if the body is not JSON. */ }
    reportSessionBoundary(path, response.status, code)
    const error = new Error(message)
    error.status = response.status
    error.code = code
    const retryAfter = Number(response.headers.get('Retry-After'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export const getSession = () => request('/api/auth/me')
export const login = (input) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(input) })
export const register = (input) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(input) })
export const logout = () => request('/api/auth/logout', { method: 'POST' })
export const resendVerification = (email) => request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) })
export const verifyEmail = (token) => request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
export const forgotPassword = (email) => request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
export const resetPassword = (token, password) => request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
export const changePassword = (currentPassword, newPassword) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
export const getCatalog = ({ search = '', category = '', signal } = {}) => {
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (category) query.set('category', category)
  return request(`/api/catalog${query.size ? `?${query}` : ''}`, { signal })
}
export const createCatalogItem = (input) => request('/api/catalog', { method: 'POST', body: JSON.stringify(input) })
export const updateCatalogItem = (id, input) => request(`/api/catalog/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteCatalogItem = (id) => request(`/api/catalog/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const updateSettings = (input) => request('/api/me/settings', { method: 'PATCH', body: JSON.stringify(input) })
export const finishTrip = (id, revision) => request(`/api/trips/${encodeURIComponent(id)}/finish`, { method: 'POST', body: JSON.stringify({ revision }) })
export const getTrips = (cursor = null, { signal } = {}) => request(`/api/trips${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`, { signal })
export const getLists = (cursor = null, { signal } = {}) => request(`/api/lists${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`, { signal })
export const getList = (id, { signal } = {}) => request(`/api/lists/${encodeURIComponent(id)}`, { signal })
export const createList = (input) => request('/api/lists', { method: 'POST', body: JSON.stringify(input) })
export const updateList = (id, input) => request(`/api/lists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteList = (id) => request(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const addListItem = (id, productId) => request(`/api/lists/${encodeURIComponent(id)}/items`, { method: 'POST', body: JSON.stringify({ productId }) })
export const updateListItem = (id, itemId, input) => request(`/api/lists/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteListItem = (id, itemId) => request(`/api/lists/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
export const getTrip = (id, { signal } = {}) => request(`/api/trips/${encodeURIComponent(id)}`, { signal })
export const correctTrip = (id, input) => request(`/api/trips/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
