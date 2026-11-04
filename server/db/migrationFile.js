import { createHash } from 'node:crypto'

// autocrlf checkouts have CRLF while stored checksums are of the committed LF files.
export function parseMigration(text) {
  const sql = text.replace(/\r\n/g, '\n')
  return { sql, sha256: createHash('sha256').update(sql).digest('hex') }
}
