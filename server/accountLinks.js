export function accountActionUrl(kind, token, { clientOrigin = process.env.CLIENT_ORIGIN, fallbackOrigin } = {}) {
  const origin = (clientOrigin || fallbackOrigin).replace(/\/$/, '')
  const action = kind === 'verify_email' ? 'verify' : 'reset'
  return `${origin}/#action=${action}&token=${encodeURIComponent(token)}`
}
