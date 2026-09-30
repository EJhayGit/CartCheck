import { lazy, Suspense, useRef, useState } from 'react'
import { PASSWORD_HINT } from './passwordPolicy.js'
import { Brand } from './Brand.jsx'

const Strength = lazy(() => import('./PasswordStrength.jsx'))
export function PasswordMeter(props) {
  return <Suspense fallback={<div className="password-meter"><p className="password-hint">{PASSWORD_HINT}</p></div>}><Strength {...props} /></Suspense>
}

export function PasswordField({ id, label = 'Password', error = '', hint, ...props }) {
  const [visible, setVisible] = useState(false)
  const input = useRef(null)
  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input {...props} id={id} ref={input} type={visible ? 'text' : 'password'} aria-invalid={error ? true : undefined} aria-describedby={[hint, error && `${id}-error`].filter(Boolean).join(' ') || undefined} />
      <button className="password-toggle" type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => { setVisible(!visible); input.current?.focus() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
      </button>
    </div>
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </div>
}

export function AuthBrand({ onHome, disabled }) {
  return <aside className="auth-story">
    <Brand className="auth-logo" onHome={onHome} disabled={disabled} />
    <div className="auth-story-copy"><p className="story-eyebrow">A LITTLE PLANNING. A BETTER SHOP.</p><h2>Less to remember.<br />More checked off.</h2><p>Keep your groceries in order, track your shopping, and make the next trip a little easier.</p></div>
    <div className="checklist-preview" aria-hidden="true"><div className="preview-heading"><span>This week’s groceries</span><span className="preview-chip">3 of 5 checked</span></div><p className="preview-subtitle">The essentials, all in one place.</p>{[['✓','Fresh vegetables','Produce'],['✓','Milk','Dairy'],['✓','Rice','Pantry'],['','Eggs','Dairy'],['','Bread','Bakery']].map(([check,name,category]) => <div className={`preview-row ${check ? 'done' : ''}`} key={name}><span className="preview-check">{check}</span><span>{name}</span><small>{category}</small></div>)}<div className="preview-footer"><span>A little more organized.</span><strong>Every trip.</strong></div></div>
    <p className="story-footnote">Your list. Your pace. Your CartCheck.</p>
  </aside>
}
