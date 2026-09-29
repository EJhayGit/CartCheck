const BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Could not connect to the server. Please try again.')
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
    const error = new Error(message)
    error.status = response.status
    error.code = code
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
export const getCart = () => request('/api/cart')
export const updateCart = (input) => request('/api/cart', { method: 'PATCH', body: JSON.stringify(input) })
export const updateSettings = (input) => request('/api/me/settings', { method: 'PATCH', body: JSON.stringify(input) })
export const addCartItem = (productId) => request('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId }) })
export const updateCartItem = (id, input) => request(`/api/cart/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteCartItem = (id) => request(`/api/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const finishTrip = (id, revision) => request(`/api/trips/${encodeURIComponent(id)}/finish`, { method: 'POST', body: JSON.stringify({ revision }) })
export const getTrips = (cursor = null) => request(`/api/trips${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`)
export const getTrip = (id) => request(`/api/trips/${encodeURIComponent(id)}`)
export const correctTrip = (id, input) => request(`/api/trips/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
