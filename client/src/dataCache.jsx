import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { createDataCache, mergeHistoryPage } from './dataCache.js'
import { getCart, getCatalog, getTrips } from './api/httpApi.js'

const DataContext = createContext(null)
export const fetchCart = (signal) => getCart({ signal })
const fetchCatalog = (signal) => getCatalog({ signal })
const fetchHistory = (signal) => getTrips(null, { signal })

export function DataCacheProvider({ children, cache: providedCache }) {
  const [localCache] = useState(createDataCache)
  const cache = providedCache || localCache
  const lifecycle = useRef(0)
  useEffect(() => {
    const version = ++lifecycle.current
    // Independent reads start together; the primary screen never waits for the others.
    for (const [key, fetcher] of [['cart', fetchCart], ['catalog', fetchCatalog], ['trips', fetchHistory]]) cache.load(key, fetcher).catch(() => {})
    function revalidate() {
      if (document.visibilityState === 'hidden') return
      cache.load('cart', fetchCart).catch(() => {})
      cache.load('trips', (signal) => getTrips(null, { signal }).then((first) => {
        const previous = cache.get('trips').data
        return mergeHistoryPage(previous, first)
      })).catch(() => {})
    }
    window.addEventListener('focus', revalidate)
    window.addEventListener('online', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('online', revalidate)
      // StrictMode replays effects synchronously. Dispose only if it wasn't remounted.
      queueMicrotask(() => { if (lifecycle.current === version) cache.dispose() })
    }
  }, [cache])
  return <DataContext.Provider value={cache}>{children}</DataContext.Provider>
}

export function useDataCache() {
  const cache = useContext(DataContext)
  if (!cache) throw new Error('Private data requires DataCacheProvider')
  return cache
}

export function useDataQuery(key, fetcher, { staleTime = 30_000, enabled = true } = {}) {
  const cache = useDataCache()
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const subscribe = useCallback((listener) => cache.subscribe(key, listener), [cache, key])
  const snapshot = useSyncExternalStore(subscribe, () => cache.get(key), () => cache.get(key))
  useEffect(() => {
    if (enabled) cache.load(key, (signal) => fetchRef.current(signal), { staleTime }).catch(() => {})
  }, [cache, key, staleTime, enabled])
  const refresh = useCallback(() => cache.load(key, (signal) => fetchRef.current(signal), { force: true }).catch(() => {}), [cache, key])
  return { ...snapshot, loading: enabled && snapshot.data === undefined && !snapshot.error, refresh }
}
