export function Brand({ onHome, disabled, className = 'brand' }) {
  return <button type="button" className={`brand-home ${className === 'auth-logo' ? 'auth-brand-home' : ''}`} aria-label="CartCheck — Go to home" onClick={onHome} disabled={disabled}>
    <img src="/cartcheck-wordmark-384.webp" srcSet="/cartcheck-wordmark-384.webp 384w, /cartcheck-wordmark-768.webp 768w" sizes="(max-width: 760px) 180px, 200px" width="384" height="96" alt="CartCheck" className={className} />
  </button>
}
export function Footer() {
  return <footer className="site-footer">© {new Date().getFullYear()} CartCheck <span aria-hidden="true">·</span> <a href="https://merzbuilds.dev">Built by Mer</a></footer>
}
export function NavIcon({ destination }) {
  const paths = {
    cart: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m7 8 1 1 2-2m-3 7 1 1 2-2m3-5h4m-4 6h4" /></>,
    catalog: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    trips: <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /><path d="M12 7v5l3 2" /></>,
    settings: <><path d="m9 3-.6 2.2-2 .9-2.1-.6-2 3.5 1.5 1.6v2.8L2.3 15l2 3.5 2.1-.6 2 .9L9 21h6l.6-2.2 2-.9 2.1.6 2-3.5-1.5-1.6v-2.8l1.5-1.6-2-3.5-2.1.6-2-.9L15 3Z" /><circle cx="12" cy="12" r="3" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[destination]}</svg>
}
