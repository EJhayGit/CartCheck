import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { parseMigration } from './migrationFile.js'

const dir = new URL('./migrations/', import.meta.url)
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

for (const filename of readdirSync(dir)) {
  test(`${filename} has the committed LF checksum in either line ending`, () => {
    const lf = readFileSync(new URL(filename, dir), 'utf8').replace(/\r\n/g, '\n')
    const crlf = lf.replace(/\n/g, '\r\n')
    assert.notEqual(sha256(crlf), sha256(lf))
    assert.equal(parseMigration(lf).sha256, sha256(lf))
    assert.equal(parseMigration(crlf).sha256, sha256(lf))
    assert.equal(parseMigration(crlf).sql, lf)
  })
}

test('a content edit still changes the checksum', () => {
  const original = parseMigration('ALTER TABLE a ADD b int;\r\n').sha256
  assert.notEqual(parseMigration('ALTER TABLE a ADD b text;\r\n').sha256, original)
  assert.notEqual(parseMigration('ALTER TABLE a ADD b int;\r\n\r\n').sha256, original)
  assert.notEqual(parseMigration('ALTER TABLE a  ADD b int;\n').sha256, original)
})
