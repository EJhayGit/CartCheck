import { PasswordField } from './AuthUI.jsx'
import { PASSWORD_HINT, passwordError, confirmationError } from './passwordPolicy.js'
import { useState } from 'react'
import { changePassword } from './api/httpApi.js'

export default function ChangePassword({ onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (passwordError(newPassword) || confirmationError(newPassword, confirmation)) { setError(passwordError(newPassword) || confirmationError(newPassword, confirmation)); return }
    setBusy(true)
    setError('')
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      onChanged()
    } catch (caught) {
      setError(caught.message)
    } finally { setBusy(false) }
  }

  return <section className="catalog-panel password-panel" aria-labelledby="change-password-heading">
    <h2 id="change-password-heading">Change password</h2>
    <p className="optional-help">After changing your password, sign in again on this device and any other devices.</p>
    <form onSubmit={submit}>
      <PasswordField id="current-password" label="Current password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={busy} />
      <PasswordField id="new-password" label="New password" error={submitted ? passwordError(newPassword) : ''} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={busy} />
      <p className="password-hint">{PASSWORD_HINT}</p><PasswordField id="confirm-password" label="Confirm new password" error={submitted || confirmation ? confirmationError(newPassword, confirmation) : ''} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} />
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="catalog-button primary" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
    </form>
  </section>
}
