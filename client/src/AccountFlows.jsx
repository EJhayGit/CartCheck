import { PasswordField } from './AuthUI.jsx'
import { PASSWORD_HINT, passwordError, confirmationError } from './passwordPolicy.js'
import { useEffect, useRef, useState } from 'react'
import { forgotPassword, resendVerification, verifyEmail } from './api/httpApi.js'

export default function AccountFlows({ view, token, email: initialEmail = '', initialCooldownUntil = 0, onBack, onContinue, onVerified, onReset }) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(initialCooldownUntil)
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((initialCooldownUntil - Date.now()) / 1000)))
  const attemptedVerification = useRef(false)

  useEffect(() => {
    if (!cooldownUntil) return
    const update = () => setSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (view !== 'verify' || attemptedVerification.current) return
    attemptedVerification.current = true
    if (!token) { setError('This verification link is invalid or has expired.'); return }
    setBusy(true)
    verifyEmail(token).then((result) => {
      setVerified(true)
      onVerified?.(result.user)
    }).catch(() => setError('This verification link is invalid or has expired. Request a new link to try again.'))
      .finally(() => setBusy(false))
  }, [view, token, onVerified])

  async function requestEmail(event) {
    event.preventDefault()
    if (busy || seconds > 0) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = view === 'forgot' ? await forgotPassword(email) : await resendVerification(email)
      setNotice(result.message || 'If this account is eligible, an email will be sent.')
      setCooldownUntil(Date.now() + 60_000)
    } catch (caught) {
      setError(caught.message)
      if (caught.status === 429) setCooldownUntil(Date.now() + (caught.retryAfter || 60) * 1000)
    } finally { setBusy(false) }
  }

  async function submitReset(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (passwordError(password) || confirmationError(password, confirmation)) { setError(passwordError(password) || confirmationError(password, confirmation)); return }
    setBusy(true)
    setError('')
    try {
      await onReset(token, password)
      setPassword('')
      setConfirmation('')
      setResetDone(true)
    } catch (caught) {
      setError(caught.message === 'Reset link is invalid or expired'
        ? 'This reset link is invalid or has expired. Request a new link.'
        : caught.message)
    } finally { setBusy(false) }
  }

  const requestVerification = view === 'pending' || view === 'verify'
  return <section className="auth-card">
    <p className="eyebrow">ACCOUNT SECURITY</p>
    <h1>{view === 'forgot' ? 'Forgot password' : view === 'reset' ? 'Reset password' : verified ? 'Email verified' : view === 'verify' ? 'Verify your email' : 'Check your email'}</h1>
    {view === 'forgot' && <>
      <p className="intro">Enter your email address to request a password reset link.</p>
      <form onSubmit={requestEmail}>
        <label htmlFor="recovery-email">Email address</label>
        <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required disabled={busy} />
        <button className="primary-button" disabled={busy || seconds > 0}>{busy ? 'Sending…' : seconds > 0 ? `Try again in ${seconds}s` : 'Send reset link'}</button>
      </form>
    </>}
    {view === 'reset' && (resetDone ? <p className="catalog-notice" role="status">Password updated. Sign in with your new password.</p> : <>
      <p className="intro">Choose a new password for your account.</p>
      <form onSubmit={submitReset}>
        <PasswordField id="reset-password" label="New password" error={submitted ? passwordError(password) : ''} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!token || busy} />
        <p className="password-hint">{PASSWORD_HINT}</p><PasswordField id="reset-confirm" label="Confirm new password" error={submitted || confirmation ? confirmationError(password, confirmation) : ''} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={!token || busy} />
        <button className="primary-button" disabled={busy || !token}>{busy ? 'Updating…' : 'Reset password'}</button>
      </form>
    </>)}
    {view === 'pending' && <><div className="account-symbol" aria-hidden="true">✉</div><p className="intro">A verification email was requested for <strong className="verification-address">{initialEmail || 'your account'}</strong>. {onContinue ? 'Open the link to confirm your email address.' : 'Open the link to confirm your email before you start shopping.'}</p></>}
    {view === 'verify' && <p className="intro">{busy ? 'Checking your link…' : verified ? 'Your email address is confirmed.' : 'You can request another link below.'}</p>}
    {requestVerification && !verified && <form onSubmit={requestEmail}>
      <label htmlFor="verification-email">Email address</label>
      <input id="verification-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required disabled={busy} />
      <button className="primary-button" disabled={busy || seconds > 0}>{busy ? 'Requesting…' : seconds > 0 ? `Resend available in ${seconds}s` : 'Resend verification email'}</button>
    </form>}
    {requestVerification && !verified && <p className="password-hint">Didn't receive the email? Check your spam folder or request a new verification link.</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {onContinue && <button className="primary-button" type="button" onClick={onContinue}>Continue to shopping list</button>}
    <p className="switch-prompt"><button className="text-button" type="button" disabled={busy} onClick={onBack}>{onContinue ? 'Back to account' : 'Back to sign in'}</button></p>
  </section>
}
