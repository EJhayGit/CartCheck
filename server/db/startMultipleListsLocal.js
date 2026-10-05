// Optional development-only PostgreSQL runtime, installed into ignored storage:
// npm install --prefix server/.test-runs/local-tools --no-audit --no-fund embedded-postgres@17.6.0-beta.15
// No production/environment connection configuration is consumed.
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const localRoot = new URL('../.test-runs/', import.meta.url)
if (process.argv.includes('--stop')) {
  const target = JSON.parse(await readFile(new URL('local-target.json', localRoot), 'utf8'))
  const path = fileURLToPath(localRoot)
  if (target.host !== '127.0.0.1' || target.port !== 55439 || !target.databaseDir.startsWith(path)) throw new Error('Unsafe fixture target')
  const binary = fileURLToPath(new URL('local-tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe', localRoot))
  console.log((await promisify(execFile)(binary, ['-D', target.databaseDir, 'stop', '-m', 'fast'], { windowsHide: true })).stdout)
} else {
  const { default: EmbeddedPostgres } = await import(new URL('local-tools/node_modules/embedded-postgres/dist/index.js', localRoot))
  const run = randomUUID()
  const pg = new EmbeddedPostgres({
    databaseDir: fileURLToPath(new URL(`postgres-${run}`, localRoot)),
    port: 55439, user: 'postgres', password: 'local-fixture-only', persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  for (const name of ['cartcheck_lists_test', 'cartcheck_lists_preview']) await pg.createDatabase(name)
  await writeFile(new URL('local-target.json', localRoot), JSON.stringify({
    run, host: '127.0.0.1', port: 55439, testDatabase: 'cartcheck_lists_test', previewDatabase: 'cartcheck_lists_preview',
    databaseDir: pg.options.databaseDir,
  }, null, 2))
  console.log('LOCAL_POSTGRES_READY 127.0.0.1:55439; isolated test and preview databases created')
  process.stdin.resume()
  let closing = false
  const stop = async () => { if (closing) return; closing = true; await pg.stop(); process.exit(0) }
  process.stdin.on('data', (data) => { if (String(data).trim() === 'stop') void stop() })
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
