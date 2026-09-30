import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AccountFlows from '../src/AccountFlows.jsx'
import { AuthBrand } from '../src/AuthUI.jsx'
import '../src/styles.css'
const view = new URLSearchParams(location.search).get('view') || 'pending'
// Standalone local visual fixtures. No accounts, emails, database, or real API calls.
window.fetch = async () => ({ok: view !== 'invalid',status:view === 'invalid' ? 400 : 200,json: async () => view === 'invalid' ? {error:'Verification link is invalid or expired'} : {message:'If this account is eligible, an email will be sent.',user:{id:'fixture',email:'shopper@example.test',email_verified:true,verification_required:false}}})
function Preview() {
 const [verified,setVerified]=useState(false)
 return <div className="auth-app"><main className="auth-main"><AuthBrand/><div className="auth-form-area"><AccountFlows view={view === 'success' || view === 'invalid' ? 'verify' : view} token="local-fixture-only" email="shopper@example.test" onVerified={()=>setVerified(true)} onContinue={verified ? ()=>location.assign('/') : null} onBack={()=>location.assign('/')} onReset={async()=>{}} /></div></main></div>
}
createRoot(document.getElementById('root')).render(<Preview/> )
