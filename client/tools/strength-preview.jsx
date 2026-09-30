import React from 'react'
import { createRoot } from 'react-dom/client'
import PasswordStrength from '../src/PasswordStrength.jsx'
import '../src/styles.css'
const samples=[['Weak','Password1!'],['Fair','river-path'],['Good','freshRiver7'],['Strong','cobalt-violet-orbit-puzzle']]
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1100,margin:'40px auto',padding:'24px'}}><p className="eyebrow">CARTCHECK · LOCAL DESIGN PREVIEW</p><h1>Password strength</h1><p className="intro">Live guidance, evaluated on your device.</p><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:24}}>{samples.map(([label,password])=><section className="auth-card" key={label}><h2 style={{fontSize:18,margin:'0 0 24px'}}>{label}</h2><PasswordStrength id={'preview-'+label} password={password}/></section>)}</div><p className="password-hint">Eight characters is the minimum. A Strong rating is optional.</p></main>)
