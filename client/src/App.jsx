import { useEffect, useState } from 'react'
import { getSession, login, logout, register } from './api/httpApi.js'

const EMPTY_FORM = { email: '', password: '' }

export default function App() {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getSession().then((result) => {
      if (active) { setUser(result.user); setStatus('ready') }
    }).catch((caught) => {
      if (active) {
        if (caught.status !== 401) setError('We could not restore your session. Please try again.')
        setStatus(caught.status === 401 ? 'ready' : 'error')
      }
    })
    return () => { active = false }
  }, [])

  async function retryRestore() {
    setError('')
    setStatus('loading')
    try {
      const result = await getSession()
      setUser(result.user)
      setStatus('ready')
    } catch (caught) {
      setStatus(caught.status === 401 ? 'ready' : 'error')
      if (caught.status !== 401) setError('We could not restore your session. Please try again.')
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await (mode === 'login' ? login(form) : register(form))
      setUser(result.user)
      setForm(EMPTY_FORM)
    } catch (caught) {
      setError(caught.message)
    } finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
      setUser(null)
      switchMode('login')
    } catch (caught) {
      setError(caught.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="app">
      <header className="site-header"><div className="header-inner"><img src="/cartcheck-logo-on-dark.svg" alt="CartCheck" className="brand" /></div></header>
      <main className="auth-main">
        {status === 'loading' && <section className="auth-card" role="status"><p className="eyebrow">CARTCHECK</p><h1>Restoring your session</h1><p>Checking your account…</p></section>}
        {status === 'error' && <section className="auth-card"><h1>Could not connect</h1><p className="alert" role="alert">{error}</p><button className="primary-button" onClick={retryRestore}>Try again</button></section>}
        {status === 'ready' && user && <section className="auth-card signed-in">
          <p className="eyebrow">WELCOME TO CARTCHECK</p><h1>You’re signed in</h1>
          <p>Your private CartCheck space is ready.</p><p className="account-email">{user.email}</p>
          {error && <p className="alert" role="alert">{error}</p>}
          <button className="primary-button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </section>}
        {status === 'ready' && !user && <section className="auth-card">
          <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
          <p className="intro">{mode === 'login' ? 'Your shopping list, catalog, and trip history are ready.' : 'Keep your catalog, active list, and shopping history together.'}</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={320} required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} required />
            {error && <p className="alert" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <p className="switch-prompt">{mode === 'login' ? 'New to CartCheck?' : 'Already have an account?'}{' '}<button className="text-button" type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
        </section>}
      </main>
    </div>
  )
}
