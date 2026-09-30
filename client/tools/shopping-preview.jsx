import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import '../src/styles.css'
const groceries=[{id:'preview-milk',name:'Milk',category:'Dairy',quantity:'1',unitLabel:'L',bought:true,estimatedTotal:null,actualTotal:null},{id:'preview-rice',name:'Rice',category:'Pantry',quantity:'2',unitLabel:'kg',bought:false,estimatedTotal:null,actualTotal:null}]
const pastTrip={id:'preview-history',completedAt:'2026-09-28T08:00:00Z',currency:'PHP',budget:null,revision:1,items:groceries,itemCount:2,boughtCount:1,notBoughtCount:1,summary:{actualTotal:null,estimatedTotal:null,actualMissingCount:1,estimatedMissingCount:2}}
// Entirely local fixtures: no shopper data or real requests, including mutations.
window.fetch=async(path,options={})=>{
 let body
 if(path==='/api/auth/me') body={user:{id:'preview-user',email:'shopper@example.test',preferred_currency:'PHP',email_verified:true,verification_required:false}}
 else if(path==='/api/cart') body={items:groceries,tripId:'preview-trip',revision:1,currency:'PHP',budget:null}
 else if(path.startsWith('/api/catalog')) body={items:[{id:'preview-milk',name:'Milk',category:'Dairy',isStarter:true}]}
 else if(path==='/api/trips') body={items:[pastTrip],nextCursor:null}
 else if(path==='/api/trips/preview-history') body={trip:pastTrip}
 else if(path==='/api/auth/logout') return {ok:true,status:204}
 else return {ok:false,status:400,headers:new Headers(),json:async()=>({error:'This local preview does not save changes.'})}
 return {ok:true,status:200,json:async()=>body}
}
createRoot(document.getElementById('root')).render(<App/> )
