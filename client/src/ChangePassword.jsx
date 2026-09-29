import { useState } from 'react'
import { changePassword } from './api/httpApi.js'

export default function ChangePassword({ onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (newPassword !== confirmation) { setError('Passwords do not match.'); return }
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
      <label htmlFor="current-password">Current password</label>
      <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
      <label htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="catalog-button primary" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
    </form>
  </section>
}
