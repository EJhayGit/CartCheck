const BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch { /* Keep the HTTP status if the body is not JSON. */ }
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export const getSession = () => request('/api/auth/me')
export const login = (input) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(input) })
export const register = (input) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(input) })
export const logout = () => request('/api/auth/logout', { method: 'POST' })
export const getCatalog = ({ search = '', category = '' } = {}) => {
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (category) query.set('category', category)
  return request(`/api/catalog${query.size ? `?${query}` : ''}`)
}
export const createCatalogItem = (input) => request('/api/catalog', { method: 'POST', body: JSON.stringify(input) })
export const updateCatalogItem = (id, input) => request(`/api/catalog/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteCatalogItem = (id) => request(`/api/catalog/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const getCart = () => request('/api/cart')
export const addCartItem = (productId) => request('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId }) })
export const updateCartItem = (id, input) => request(`/api/cart/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
export const deleteCartItem = (id) => request(`/api/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
