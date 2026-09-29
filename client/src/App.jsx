import { useEffect, useRef, useState } from 'react'
import { addCartItem, getSession, login, logout, register, resetPassword, updateSettings } from './api/httpApi.js'
import Catalog from './Catalog.jsx'
import ShoppingList from './ShoppingList.jsx'
import Trips from './Trips.jsx'
import AccountFlows from './AccountFlows.jsx'
import ChangePassword from './ChangePassword.jsx'
import { resetAndRevalidate, revalidateCurrentSession } from './resetSession.js'

const EMPTY_FORM = { email: '', password: '' }
const link = (() => {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.slice(1))
  const action = params.get('action')
  const token = params.get('token')
  if (action !== 'verify' && action !== 'reset') return null
  window.history.replaceState(null, '', url.pathname + url.search)
  return { action, token }
})()

export default function App() {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [accountView, setAccountView] = useState(link?.action || '')
  const [linkToken] = useState(link?.token || '')
  const [accountEmail, setAccountEmail] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState('cart')
  const [catalogVisited, setCatalogVisited] = useState(false)
  const [requestedEdit, setRequestedEdit] = useState(null)
  const [cartPending, setCartPending] = useState(false)
  const [catalogAddPending, setCatalogAddPending] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [preferredCurrency, setPreferredCurrency] = useState('PHP')
  const [settingsError, setSettingsError] = useState('')
  const [settingsNotice, setSettingsNotice] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const accountGeneration = useRef(0)
  const resetCheckPending = useRef(false)
  const cartPendingRef = useRef(false)
  const catalogAddPendingRef = useRef(false)
  const renderedGeneration = accountGeneration.current

  function reportCartPending(pending) {
    if (renderedGeneration !== accountGeneration.current) return
    cartPendingRef.current = pending
    setCartPending(pending)
  }

  function reportCatalogAddPending(pending) {
    if (renderedGeneration !== accountGeneration.current) return
    catalogAddPendingRef.current = pending
    setCatalogAddPending(pending)
  }

  useEffect(() => {
    let active = true
    const generation = accountGeneration.current
    getSession().then((result) => {
      if (active && generation === accountGeneration.current) {
        setUser(result.user)
        setPreferredCurrency(result.user.preferred_currency)
        if (result.user.verification_required && !link) { setAccountEmail(result.user.email); setAccountView('pending') }
        setStatus('ready')
      }
    }).catch((caught) => {
      if (active && generation === accountGeneration.current) {
        if (caught.status !== 401) setError('We could not restore your session. Please try again.')
        setStatus(caught.status === 401 ? 'ready' : 'error')
      }
    })
    return () => { active = false }
  }, [])

  async function retryRestore() {
    setError('')
    setStatus('loading')
    if (resetCheckPending.current) {
      const outcome = await revalidateCurrentSession({ getSession, getGeneration: () => accountGeneration.current })
      await applyResetOutcome(outcome)
      return
    }
    const generation = accountGeneration.current
    try {
      const result = await getSession()
      if (generation !== accountGeneration.current) { setStatus('ready'); return }
      setUser(result.user)
      setPreferredCurrency(result.user.preferred_currency)
      if (result.user.verification_required && !link) { setAccountEmail(result.user.email); setAccountView('pending') }
      setPage('cart')
      setCatalogVisited(false)
      setStatus('ready')
    } catch (caught) {
      if (generation !== accountGeneration.current) { setStatus('ready'); return }
      if (caught.status === 401) setUser(null)
      setStatus(caught.status === 401 ? 'ready' : 'error')
      if (caught.status !== 401) setError('We could not restore your session. Please try again.')
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setForm(EMPTY_FORM)
    setError('')
    setAuthNotice('')
  }

  function returnToSignIn() {
    setAccountView('')
    switchMode('login')
  }

  function clearRevokedSession() {
    accountGeneration.current += 1
    resetCheckPending.current = false
    setUser(null)
    setPreferredCurrency('PHP')
    setPage('cart')
    setCatalogVisited(false)
    setRequestedEdit(null)
    cartPendingRef.current = false
    catalogAddPendingRef.current = false
    setCartPending(false)
    setCatalogAddPending(false)
    setAccountView('')
    setStatus('ready')
    setError('')
    switchMode('login')
    setAuthNotice('Password updated. Sign in with your new password.')
  }

  async function applyResetOutcome(initialOutcome) {
    let outcome = initialOutcome
    if (outcome.generation !== accountGeneration.current) {
      outcome = await revalidateCurrentSession({ getSession, getGeneration: () => accountGeneration.current })
    }
    if (outcome.generation !== accountGeneration.current) outcome = { status: 'unknown' }

    if (outcome.status === 'authenticated') {
      if (user?.id && user.id !== outcome.user.id) {
        accountGeneration.current += 1
        setPage('cart')
        setCatalogVisited(false)
        setRequestedEdit(null)
        cartPendingRef.current = false
        catalogAddPendingRef.current = false
        setCartPending(false)
        setCatalogAddPending(false)
      }
      setUser(outcome.user)
      setPreferredCurrency(outcome.user.preferred_currency)
      setAccountView('')
      setStatus('ready')
      setError('')
      resetCheckPending.current = false
    } else if (outcome.status === 'unauthenticated') {
      clearRevokedSession()
    } else {
      // Keep the last known account in memory, but hide private screens until
      // a successful retry confirms whether its server session still exists.
      setStatus('error')
      setError('Password updated, but we could not confirm your current sign-in. Try again.')
    }
  }

  async function finishPasswordReset(token, password) {
    const outcome = await resetAndRevalidate({
      resetPassword: () => resetPassword(token, password),
      getSession,
      getGeneration: () => accountGeneration.current,
      onResetSucceeded: () => { resetCheckPending.current = true },
    })
    await applyResetOutcome(outcome)
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await (mode === 'login' ? login(form) : register(form))
      accountGeneration.current += 1
      setUser(result.user)
      setPreferredCurrency(result.user.preferred_currency)
      setPage('cart')
      setCatalogVisited(false)
      setSettingsError('')
      setSettingsNotice('')
      setForm(EMPTY_FORM)
      if (result.user.verification_required || (mode === 'register' && !result.user.email_verified)) {
        setAccountEmail(result.user.email)
        setAccountView('pending')
      }
    } catch (caught) {
      if (caught.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setAccountEmail(form.email)
        setAccountView('pending')
      } else setError(caught.message)
    } finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
      accountGeneration.current += 1
      setUser(null)
      setPreferredCurrency('PHP')
      setSettingsError('')
      setSettingsNotice('')
      setPage('cart')
      setCatalogVisited(false)
      setAccountView('')
      setRequestedEdit(null)
      cartPendingRef.current = false
      catalogAddPendingRef.current = false
      setCartPending(false)
      setCatalogAddPending(false)
      switchMode('login')
    } catch (caught) {
      setError(caught.message)
    } finally { setBusy(false) }
  }

  async function addItem(productId) {
    const generation = accountGeneration.current
    const result = await addCartItem(productId)
    if (generation !== accountGeneration.current) return result
    setRequestedEdit(result.item)
    setPage('cart')
    return result
  }

  function browseCatalog() {
    if (cartPendingRef.current || catalogAddPendingRef.current) return
    setCatalogVisited(true)
    setPage('catalog')
  }

  async function saveSettings(event) {
    event.preventDefault()
    if (settingsBusy) return
    const generation = accountGeneration.current
    setSettingsBusy(true)
    setSettingsError('')
    setSettingsNotice('')
    try {
      const result = await updateSettings({ preferredCurrency })
      if (generation !== accountGeneration.current) return
      setUser((current) => ({ ...current, preferred_currency: result.preferredCurrency }))
      setPreferredCurrency(result.preferredCurrency)
      setSettingsNotice('Currency preference saved for future trips.')
    } catch (caught) {
      if (generation !== accountGeneration.current) return
      setPreferredCurrency(user.preferred_currency)
      setSettingsError(caught.message || 'We could not save your settings.')
    } finally { if (generation === accountGeneration.current) setSettingsBusy(false) }
  }

  function navigation() {
    const switchingDisabled = cartPending || catalogAddPending || settingsBusy || reviewOpen
    return <>
      <button type="button" className={page === 'cart' ? 'active' : ''} aria-current={page === 'cart' ? 'page' : undefined} onClick={() => { if (!cartPendingRef.current && !catalogAddPendingRef.current) setPage('cart') }} disabled={switchingDisabled}>Shopping list</button>
      <button type="button" className={page === 'catalog' ? 'active' : ''} aria-current={page === 'catalog' ? 'page' : undefined} onClick={browseCatalog} disabled={switchingDisabled}>Catalog</button>
      <button type="button" className={page === 'trips' ? 'active' : ''} aria-current={page === 'trips' ? 'page' : undefined} onClick={() => { if (!switchingDisabled) setPage('trips') }} disabled={switchingDisabled}>Trips</button>
      <button type="button" className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => { if (!switchingDisabled) setPage('settings') }} disabled={switchingDisabled}>Settings</button>
      <button type="button" onClick={signOut} disabled={busy || settingsBusy || cartPending || catalogAddPending || reviewOpen}>Sign out</button>
    </>
  }

  return (
    <div className="app">
      <header className="site-header"><div className="header-inner"><img src="/cartcheck-logo-on-dark.svg" alt="CartCheck" className="brand" />{status === 'ready' && user && !accountView && <nav className="catalog-nav" aria-label="Main navigation">{navigation()}</nav>}</div></header>
      {status === 'ready' && user && !accountView ? <>
        {error && <p className="alert" role="alert">{error}</p>}
        <div hidden={page !== 'cart'}><ShoppingList key={user.id} editItem={requestedEdit} onEditHandled={() => setRequestedEdit(null)} onBrowseCatalog={browseCatalog} onMutationPending={reportCartPending} onReviewChange={setReviewOpen} /></div>
        {catalogVisited && <div hidden={page !== 'catalog'}><Catalog onAdd={addItem} onAddPending={reportCatalogAddPending} /></div>}
        {page === 'trips' && <Trips key={user.id} onReviewChange={setReviewOpen} />}
        {page === 'settings' && <main className="settings-main">
          <section className="catalog-panel" aria-labelledby="settings-heading">
            <p className="catalog-eyebrow">ACCOUNT</p><h1 id="settings-heading">Settings</h1>
            <p className="optional-help">Your current shopping trip keeps its currency. This preference applies when a new trip begins.</p>
            <form onSubmit={saveSettings}>
              <label htmlFor="preferred-currency">Preferred currency for future trips</label>
              <select id="preferred-currency" value={preferredCurrency} onChange={(event) => { setPreferredCurrency(event.target.value); setSettingsNotice(''); setSettingsError('') }} disabled={settingsBusy}><option value="PHP">PHP — Philippine peso</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — euro</option></select>
              {settingsError && <p className="alert" role="alert">{settingsError}</p>}{settingsNotice && <p className="catalog-notice" role="status">{settingsNotice}</p>}
              <button className="catalog-button primary" type="submit" disabled={settingsBusy || preferredCurrency === user.preferred_currency}>{settingsBusy ? 'Saving…' : 'Save preference'}</button>
            </form>
            {!user.email_verified && <div className="verification-settings"><h2>Email verification</h2><p>Your email has not been verified.</p><button className="catalog-button secondary" type="button" onClick={() => { setAccountEmail(user.email); setAccountView('pending') }}>Verify your email</button></div>}
            <button className="catalog-button secondary mobile-sign-out" type="button" onClick={signOut} disabled={busy || settingsBusy}>Sign out</button>
          </section>
          <ChangePassword onChanged={clearRevokedSession} />
        </main>}
      </> : <main className="auth-main">
        {status === 'loading' && <section className="auth-card" role="status"><p className="eyebrow">CARTCHECK</p><h1>Restoring your session</h1><p>Checking your account…</p></section>}
        {status === 'error' && <section className="auth-card"><h1>Could not connect</h1><p className="alert" role="alert">{error}</p><button className="primary-button" onClick={retryRestore}>Try again</button></section>}
        {status === 'ready' && accountView && <AccountFlows view={accountView} token={linkToken} email={accountEmail} onBack={user?.verification_required ? signOut : returnToSignIn} onContinue={user && !user.verification_required ? () => setAccountView('') : null} onVerified={(verifiedUser) => { if (verifiedUser && user?.id === verifiedUser.id) setUser(verifiedUser) }} onReset={finishPasswordReset} />}
        {status === 'ready' && !user && !accountView && <section className="auth-card">
          <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
          <p className="intro">{mode === 'login' ? 'Your shopping list, catalog, and trip history are ready.' : 'Keep your catalog, active list, and shopping history together.'}</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={320} required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} required />
            {error && <p className="alert" role="alert">{error}</p>}
            {authNotice && <p className="catalog-notice" role="status">{authNotice}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          {mode === 'login' && <p className="switch-prompt"><button className="text-button" type="button" onClick={() => { setAccountEmail(form.email); setAccountView('forgot') }}>Forgot password?</button></p>}
          <p className="switch-prompt">{mode === 'login' ? 'New to CartCheck?' : 'Already have an account?'}{' '}<button className="text-button" type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
        </section>}
      </main>}
      {status === 'ready' && user && !accountView && <nav className="catalog-mobile-nav" aria-label="Mobile navigation">{navigation()}</nav>}
    </div>
  )
}
