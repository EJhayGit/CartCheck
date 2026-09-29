import { useEffect, useRef, useState } from 'react'
import { forgotPassword, resendVerification, verifyEmail } from './api/httpApi.js'

export default function AccountFlows({ view, token, email: initialEmail = '', onBack, onContinue, onVerified, onReset }) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const attemptedVerification = useRef(false)

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
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = view === 'forgot' ? await forgotPassword(email) : await resendVerification(email)
      setNotice(result.message || 'If this account is eligible, an email will be sent.')
    } catch (caught) {
      setError(caught.message)
    } finally { setBusy(false) }
  }

  async function submitReset(event) {
    event.preventDefault()
    if (busy) return
    if (password !== confirmation) { setError('Passwords do not match.'); return }
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
        <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
        <button className="primary-button" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
    </>}
    {view === 'reset' && (resetDone ? <p className="catalog-notice" role="status">Password updated. Sign in with your new password.</p> : <>
      <p className="intro">Choose a new password for your account.</p>
      <form onSubmit={submitReset}>
        <label htmlFor="reset-password">New password</label>
        <input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!token} />
        <label htmlFor="reset-confirm">Confirm new password</label>
        <input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={!token} />
        <button className="primary-button" disabled={busy || !token}>{busy ? 'Updating…' : 'Reset password'}</button>
      </form>
    </>)}
    {view === 'pending' && <p className="intro">If email delivery is configured, look for a verification link in your inbox. {onContinue ? 'You can continue shopping while verification is optional.' : 'Verify your email to continue.'}</p>}
    {view === 'verify' && <p className="intro">{busy ? 'Checking your link…' : verified ? 'Your email address is confirmed.' : 'You can request another link below.'}</p>}
    {requestVerification && !verified && <form onSubmit={requestEmail}>
      <label htmlFor="verification-email">Email address</label>
      <input id="verification-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
      <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : 'Resend verification email'}</button>
    </form>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {onContinue && <button className="primary-button" type="button" onClick={onContinue}>Continue to shopping list</button>}
    <p className="switch-prompt"><button className="text-button" type="button" onClick={onBack}>{onContinue ? 'Back to account' : 'Back to sign in'}</button></p>
  </section>
}
