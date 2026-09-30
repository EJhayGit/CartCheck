import { useEffect, useState } from 'react'
import { passwordStrength } from './passwordStrength.js'
import { PASSWORD_HINT } from './passwordPolicy.js'

export default function PasswordStrength({ password, email, id = 'password-guidance' }) {
  const strength = passwordStrength(password, email)
  const [announcement, setAnnouncement] = useState('')
  const label = strength?.label || ''
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(label ? `Password strength: ${label}` : ''), 600)
    return () => clearTimeout(timer)
  }, [label])
  return <div className="password-meter" id={id}>
    <div className="strength-heading"><span>Password strength</span><strong className={`strength-${strength?.level || 0}`}>{label || '—'}</strong></div>
    <div className={`strength-track strength-${strength?.level || 0}`} aria-hidden="true"><span style={{width:`${(strength?.level || 0) * 25}%`}} /></div>
    <p className="strength-guidance">{strength?.guidance || 'A few memorable words can make a great password.'}</p>
    <p className="password-hint">{PASSWORD_HINT}</p><span className="sr-only" role="status">{announcement}</span>
  </div>
}
