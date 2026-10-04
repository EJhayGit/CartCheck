import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import '../src/styles.css'
const catalog = [
 ['Milk','Dairy & eggs'], ['Rice','Pantry'], ['Bananas','Produce'], ['Eggs','Dairy & eggs'],
 ['Chicken breast','Meat & seafood'], ['Whole wheat bread','Bakery'], ['Carrots','Produce'],
 ['Tomatoes','Produce'], ['Coffee','Beverages'], ['Frozen peas','Frozen'], ['Pasta','Pantry'],
 ['Yogurt','Dairy & eggs'], ['Dishwashing liquid','Household'], ['Rolled oats','Pantry'],
 ['Apples','Produce'], ['Cheddar cheese','Dairy & eggs'], ['Orange juice','Beverages'],
 ['Olive oil','Pantry'], ['Crackers','Snacks'], ['Laundry detergent','Household'],
 ['Family-size unsweetened almond and oat breakfast drink','Beverages'],
].map(([name,category], index) => ({id:`preview-${index}`,name,category,source:index === 20 ? 'custom' : 'starter'}))
const groceries=catalog.slice(0, 9).map((item,index) => ({...item,quantity:index === 1 ? '2' : '1',unitLabel:index === 1 ? 'kg' : 'pack',bought:index < 3,estimatedTotal:index === 8 ? null : '100.00',actualTotal:index < 2 ? '95.00' : null}))
const pastTrip={id:'preview-history',completedAt:'2026-09-28T08:00:00Z',currency:'PHP',budget:'1500.00',revision:1,items:groceries,itemCount:9,boughtCount:3,notBoughtCount:6,summary:{actualTotal:'190.00',estimatedTotal:'800.00',actualMissingCount:1,estimatedMissingCount:1}}
// Entirely local fixtures: no shopper data or real requests, including mutations.
window.fetch=async(path,options={})=>{
 let body
 if(path==='/api/auth/me') body={user:{id:'preview-user',email:'shopper@example.test',preferred_currency:'PHP',email_verified:true,verification_required:false}}
 else if(path==='/api/cart') body={items:groceries,tripId:'preview-trip',revision:1,currency:'PHP',budget:'1500.00'}
 else if(path.startsWith('/api/catalog')) { const params=new URL(path, location.origin).searchParams; body={items:catalog.filter(item => (!params.get('search') || item.name.toLowerCase().includes(params.get('search').toLowerCase())) && (!params.get('category') || item.category === params.get('category')))} }
 else if(path==='/api/trips') body={items:[pastTrip, {...pastTrip,id:'preview-history-2',completedAt:'2026-09-21T08:00:00Z'}, {...pastTrip,id:'preview-history-3',completedAt:'2026-09-14T08:00:00Z'}],nextCursor:null}
 else if(path==='/api/trips/preview-history') body={trip:pastTrip}
 else if(path==='/api/auth/logout') return {ok:true,status:204}
 else return {ok:false,status:400,headers:new Headers(),json:async()=>({error:'This local preview does not save changes.'})}
 return {ok:true,status:200,json:async()=>body}
}
createRoot(document.getElementById('root')).render(<App/> )
