import { useEffect, useState } from 'react'

export const APPEARANCE_KEY = 'cartcheck.appearance'
export function readAppearance() {
  try { const value = window.localStorage.getItem(APPEARANCE_KEY); return ['light', 'dark', 'system'].includes(value) ? value : 'light' } catch { return 'light' }
}
export function useAppearance() {
  const [appearance, setAppearance] = useState(readAppearance)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = appearance === 'dark' || (appearance === 'system' && media?.matches) ? 'dark' : 'light'
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    }
    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [appearance])
  useEffect(() => {
    const synchronize = (event) => { if (event.key === APPEARANCE_KEY || event.key === null) setAppearance(readAppearance()) }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])
  return [appearance, (value) => {
    setAppearance(value)
    try { window.localStorage.setItem(APPEARANCE_KEY, value) } catch { /* Still usable when browser storage is unavailable. */ }
  }]
}
