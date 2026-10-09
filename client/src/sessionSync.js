const STORAGE_KEY = 'cartcheck:session-change'
const CHANNEL_NAME = 'cartcheck-session'
const MESSAGE_TYPE = 'session-changed'

let channel
function getChannel() {
  const BrowserChannel = typeof window === 'undefined' ? null : window.BroadcastChannel
  if (!BrowserChannel) return null
  if (!channel) channel = new BrowserChannel(CHANNEL_NAME)
  return channel
}

// The signal carries no user id, cookie, or credential. Receiving tabs ask
// /auth/me which account now owns the shared browser session.
export function announceSessionChange() {
  try {
    const currentChannel = getChannel()
    if (currentChannel) { currentChannel.postMessage({ type: MESSAGE_TYPE }); return }
  } catch { /* Storage remains a fallback. */ }
  try { window.localStorage.setItem(STORAGE_KEY, `${Date.now()}:${Math.random()}`) } catch { /* Storage can be disabled. */ }
}

export function subscribeToSessionChanges(listener) {
  const currentChannel = getChannel()
  const onMessage = (event) => { if (event.data?.type === MESSAGE_TYPE) listener() }
  const onStorage = (event) => { if (event.key === STORAGE_KEY && event.newValue) listener() }
  currentChannel?.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  return () => {
    currentChannel?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}
