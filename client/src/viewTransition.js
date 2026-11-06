import { flushSync } from 'react-dom'

// Resolves once `update` has run and React has committed it, so callers can
// await it before starting a request whose failure would roll the update back.
export function withViewTransition(update, doc = globalThis.document) {
  if (!doc?.startViewTransition || doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    update()
    return Promise.resolve()
  }
  return doc.startViewTransition(() => flushSync(update)).updateCallbackDone
}
