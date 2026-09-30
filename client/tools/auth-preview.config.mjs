import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ root: '.', plugins: [react(), {name:'isolated-auth-preview', configureServer(server) {server.middlewares.use('/api', (req,res) => {res.setHeader('Content-Type','application/json'); res.statusCode=401; res.end(JSON.stringify({error:'Sign in required'}))})}}], server:{fs:{allow:['..']},host:'127.0.0.1',port:4174,strictPort:true} })
