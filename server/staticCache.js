import { basename, dirname } from 'node:path'

// Vite puts a content hash in every file name under assets/, so a changed file always gets a new URL.
export function setStaticCacheHeaders(response, filePath) {
  response.setHeader('Cache-Control', basename(dirname(filePath)) === 'assets' ? 'public, max-age=31536000, immutable' : 'no-cache')
}
