import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { createDataCache, listSummary, mergeHistoryPage } from './dataCache.js'
import { getCatalog, getLists, getTrips } from './api/httpApi.js'

const DataContext = createContext(null)
const fetchCatalog = (signal) => getCatalog({ signal })
const fetchHistory = (signal) => getTrips(null, { signal })
export const fetchLists = async (signal) => {
  const page = await getLists(null, { signal })
  return { ...page, items: page.items.map(listSummary) }
}

export function DataCacheProvider({ children, cache: providedCache, onRevalidate }) {
  const [localCache] = useState(createDataCache)
  const cache = providedCache || localCache
  const lifecycle = useRef(0)
  const onRevalidateRef = useRef(onRevalidate)
  onRevalidateRef.current = onRevalidate
  useEffect(() => {
    const version = ++lifecycle.current
    // Independent reads start together; the primary screen never waits for the others.
    for (const [key, fetcher] of [['lists', fetchLists], ['catalog', fetchCatalog], ['trips', fetchHistory]]) cache.load(key, fetcher).catch(() => {})
    async function revalidate() {
      if (document.visibilityState === 'hidden') return
      if (onRevalidateRef.current && !await onRevalidateRef.current()) return
      cache.load('lists', fetchLists).catch(() => {})
      cache.load('trips', (signal) => getTrips(null, { signal }).then((first) => {
        const previous = cache.get('trips').data
        return mergeHistoryPage(previous, first)
      })).catch(() => {})
      cache.revalidateSubscribedDetails()
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
