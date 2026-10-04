import { useEffect, useMemo, useRef, useState } from 'react'
import { addCartItem, getSession, login, logout, register, resetPassword, updateSettings } from './api/httpApi.js'
import Catalog from './Catalog.jsx'
import { Brand, Footer, NavIcon } from './Brand.jsx'
import { useAppearance } from './appearance.js'
import ShoppingList from './ShoppingList.jsx'
import Trips from './Trips.jsx'
import AccountFlows from './AccountFlows.jsx'
import ChangePassword from './ChangePassword.jsx'
import { AuthBrand, PasswordField, PasswordMeter } from './AuthUI.jsx'
import { confirmationError, passwordError } from './passwordPolicy.js'
import { resetAndRevalidate, revalidateCurrentSession } from './resetSession.js'
import { createDataCache } from './dataCache.js'
import { DataCacheProvider, fetchCart } from './dataCache.jsx'
import { hasPurchaseMutation, purchaseIntentVersion } from './purchaseMutations.js'

const EMPTY_FORM = { email: '', password: '', confirmation: '' }
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
  const [appearance, setAppearance] = useAppearance()
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [accountView, setAccountView] = useState(link?.action || '')
  const [linkToken] = useState(link?.token || '')
  const [accountEmail, setAccountEmail] = useState('')
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0)
  const [authNotice, setAuthNotice] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
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
  const sessionRestore = useRef(null)
  const resetCheckPending = useRef(false)
  const cartPendingRef = useRef(false)
  const catalogAddPendingRef = useRef(false)
  const renderedGeneration = accountGeneration.current
  const privateReady = status === 'ready' && user && !user.verification_required && !accountView
  const dataCache = useMemo(() => createDataCache(), [user?.id, renderedGeneration, Boolean(privateReady)])

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
    // Share only this mount's restoration request across StrictMode effect replay.
    // Retry and post-password-reset validation still make fresh session checks.
    const restoring = sessionRestore.current || (sessionRestore.current = getSession())
    restoring.then((result) => {
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
    setForm((current) => ({ ...EMPTY_FORM, email: current.email }))
    setSubmitted(false)
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
      setAccountEmail(outcome.user.email)
      setAccountView(outcome.user.verification_required ? 'pending' : '')
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
    if (busy) return
    setSubmitted(true)
    if (mode === 'register') {
      if (!event.currentTarget.elements.email.reportValidity()) return
      if (passwordError(form.password) || confirmationError(form.password, form.confirmation)) {
        event.currentTarget.elements[passwordError(form.password) ? 'password' : 'registration-confirm'].focus()
        return
      }
    }
    setBusy(true)
    setError('')
    try {
      const result = await (mode === 'login' ? login({ email: form.email, password: form.password }) : register({ email: form.email, password: form.password }))
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
        if (mode === 'register') setEmailCooldownUntil(Date.now() + 60_000)
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
    // Join the initial cart read if necessary so item updates retain trip metadata.
    await dataCache.load('cart', fetchCart)
    if (generation !== accountGeneration.current || !dataCache.alive) return
    const release = dataCache.beginMutation('cart')
    const purchaseVersions = new Map(dataCache.get('cart').data.items.map((item) => [item.id, purchaseIntentVersion(dataCache, item.id)]))
    const pendingPurchases = new Set(dataCache.get('cart').data.items.filter((item) => hasPurchaseMutation(dataCache, item.id)).map((item) => item.id))
    try {
      const result = await addCartItem(productId)
      if (generation !== accountGeneration.current || !dataCache.alive) return result
      // Adding an existing entry does not change its bought state. Preserve a
      // pending local purchase intent if its PATCH has not completed yet.
      const existing = dataCache.get('cart').data?.items.find((item) => item.id === result.item.id)
      if (existing && (pendingPurchases.has(existing.id) || hasPurchaseMutation(dataCache, existing.id) || purchaseVersions.get(existing.id) !== purchaseIntentVersion(dataCache, existing.id))) {
        result.item = { ...result.item, bought: existing.bought }
      }
      dataCache.set('cart', (current) => ({ ...current, items: current.items.some((item) => item.id === result.item.id)
        ? current.items.map((item) => item.id === result.item.id ? result.item : item)
        : [...current.items, result.item] }))
      setRequestedEdit(result.item)
      setPage('cart')
      return result
    } catch (caught) {
      dataCache.invalidate('cart')
      throw caught
    } finally { release() }
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

  function goHome() {
    if (busy || accountBusy || settingsBusy || cartPendingRef.current || catalogAddPendingRef.current || reviewOpen || status !== 'ready') return
    if (user?.verification_required) return
    if (user) { setAccountView(''); setPage('cart') }
    else returnToSignIn()
  }

  function navigation() {
    const switchingDisabled = cartPending || catalogAddPending || settingsBusy || reviewOpen
    return <>
      <button type="button" className={page === 'cart' ? 'active' : ''} aria-current={page === 'cart' ? 'page' : undefined} onClick={() => { if (!cartPendingRef.current && !catalogAddPendingRef.current) setPage('cart') }} disabled={switchingDisabled}><NavIcon destination="cart" /><span>Shopping list</span></button>
      <button type="button" className={page === 'catalog' ? 'active' : ''} aria-current={page === 'catalog' ? 'page' : undefined} onClick={browseCatalog} disabled={switchingDisabled}><NavIcon destination="catalog" /><span>Catalog</span></button>
      <button type="button" className={page === 'trips' ? 'active' : ''} aria-current={page === 'trips' ? 'page' : undefined} onClick={() => { if (!switchingDisabled) setPage('trips') }} disabled={switchingDisabled}><NavIcon destination="trips" /><span>Trips</span></button>
      <button type="button" className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => { if (!switchingDisabled) setPage('settings') }} disabled={switchingDisabled}><NavIcon destination="settings" /><span>Settings</span></button>
      <button type="button" onClick={signOut} disabled={busy || settingsBusy || cartPending || catalogAddPending || reviewOpen}>Sign out</button>
    </>
  }

  return (
    <div className={`app ${!user || accountView || status !== 'ready' || user.verification_required ? 'auth-app' : ''}`}>
      <header className="site-header"><div className="header-inner"><Brand onHome={goHome} disabled={busy || settingsBusy || cartPending || catalogAddPending || reviewOpen || status !== 'ready'} />{status === 'ready' && user && !user.verification_required && !accountView && <nav className="catalog-nav" aria-label="Main navigation">{navigation()}</nav>}</div></header>
      {privateReady ? <DataCacheProvider key={`${user.id}:${renderedGeneration}`} cache={dataCache}>
        {error && <p className="alert" role="alert">{error}</p>}
        <div hidden={page !== 'cart'}><ShoppingList key={user.id} active={page === 'cart'} editItem={requestedEdit} onEditHandled={() => setRequestedEdit(null)} onBrowseCatalog={browseCatalog} onMutationPending={reportCartPending} onReviewChange={setReviewOpen} /></div>
        {catalogVisited && <div hidden={page !== 'catalog'}><Catalog active={page === 'catalog'} onAdd={addItem} onAddPending={reportCatalogAddPending} /></div>}
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
          <section className="catalog-panel appearance-panel" aria-labelledby="appearance-heading"><h2 id="appearance-heading">Appearance</h2><p className="appearance-help">Choose your look. Saved in this browser across visits.</p><div className="appearance-options" role="group" aria-label="Appearance">{['light', 'dark', 'system'].map((option) => <button type="button" key={option} aria-pressed={appearance === option} onClick={() => setAppearance(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div><p className="appearance-help">System follows your device’s color preference.</p></section>
          <ChangePassword onChanged={clearRevokedSession} />
        </main>}
      </DataCacheProvider> : <main className="auth-main"><AuthBrand onHome={goHome} disabled={busy || accountBusy || status !== 'ready' || user?.verification_required} /><div className="auth-form-area">
        {status === 'loading' && <section className="auth-card" role="status"><p className="eyebrow">CARTCHECK</p><h1>Restoring your session</h1><p>Checking your account…</p></section>}
        {status === 'error' && <section className="auth-card"><h1>Could not connect</h1><p className="alert" role="alert">{error}</p><button className="primary-button" onClick={retryRestore}>Try again</button></section>}
        {status === 'ready' && accountView && <AccountFlows onBusyChange={setAccountBusy} key={`${accountView}:${accountEmail}`} view={accountView} token={linkToken} email={accountEmail} initialCooldownUntil={emailCooldownUntil} onBack={user?.verification_required ? signOut : returnToSignIn} onContinue={user && !user.verification_required ? () => setAccountView('') : null} onVerified={(verifiedUser) => { if (verifiedUser && user?.id === verifiedUser.id) setUser(verifiedUser) }} onReset={finishPasswordReset} />}
        {status === 'ready' && !user && !accountView && <section className="auth-card">
          <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
          <p className="intro">{mode === 'login' ? 'Your shopping list, catalog, and trip history are ready.' : 'Keep your catalog, active list, and shopping history together.'}</p>
          <form onSubmit={submit} noValidate={mode === 'register'}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={320} required disabled={busy} />
            <PasswordField key={mode} id="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} error={mode === 'register' && submitted ? passwordError(form.password) : ''} hint={mode === 'register' ? 'password-guidance' : undefined} required disabled={busy} />
            {mode === 'register' && <><PasswordMeter password={form.password} email={form.email} /><PasswordField id="registration-confirm" label="Confirm password" autoComplete="new-password" value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} error={submitted || form.confirmation ? confirmationError(form.password, form.confirmation) : ''} required disabled={busy} /><p className="auth-security-note">We’ll email you a verification link before you start shopping.</p></>}
            {error && <p className="alert" role="alert">{error}</p>}
            {authNotice && <p className="catalog-notice" role="status">{authNotice}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          {mode === 'login' && <p className="switch-prompt"><button className="text-button" type="button" disabled={busy} onClick={() => { setAccountEmail(form.email); setAccountView('forgot') }}>Forgot password?</button></p>}
          <p className="switch-prompt">{mode === 'login' ? 'New to CartCheck?' : 'Already have an account?'}{' '}<button className="text-button" type="button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
        </section>}
      </div></main>}
      <Footer />
      {status === 'ready' && user && !user.verification_required && !accountView && <nav className="catalog-mobile-nav" aria-label="Mobile navigation">{navigation()}</nav>}
    </div>
  )
}
