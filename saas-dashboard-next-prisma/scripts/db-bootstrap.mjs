import fs from 'fs'
import { execSync, spawnSync } from 'child_process'
import { Client as Pg } from 'pg'
import path from 'path'

const envPath = path.join(process.cwd(), '.env')
const ex = (cmd) => { try { execSync(cmd, { stdio: 'inherit' }) } catch(e) {} }

function readEnv() {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const map = {}
  raw.split('\n').forEach(l=>{
    const m = l.match(/^([^#=\s]+)\s*=\s*(.*)$/)
    if (m) map[m[1]] = m[2]
  })
  return map
}
function writeEnv(obj) {
  const lines = Object.entries(obj).map(([k,v])=>`${k}=${v}`)
  fs.writeFileSync(envPath, lines.join('\n'))
}

async function canConnectPg(url, timeoutMs=60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const c = new Pg({ connectionString: url })
      await c.connect()
      await c.end()
      return true
    } catch (e) {
      await new Promise(r=>setTimeout(r, 2000))
    }
  }
  return false
}

async function main() {
  if (!fs.existsSync(envPath)) {
    const defaultEnv = [
      'NEXTAUTH_URL=http://localhost:3000',
      'NEXTAUTH_SECRET=replace-with-openssl-rand',
      'NEXT_PUBLIC_APP_URL=http://localhost:3000',
      '',
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas',
      'DATABASE_URL_PG=postgresql://postgres:postgres@localhost:5432/saas',
      '',
      'DATABASE_URL_SQLITE=file:./dev.db'
    ].join('\n')
    fs.writeFileSync(envPath, defaultEnv)
    console.log('> .env creado con valores predeterminados')
  }
  const env = readEnv()
  const pgUrl = env.DATABASE_URL_PG || 'postgresql://postgres:postgres@localhost:5432/saas'
  const sqliteUrl = env.DATABASE_URL_SQLITE || 'file:./dev.db'

  let use = 'pg'
  const arg = process.argv.find(a=>a==='--sqlite' || a==='--pg')
  if (arg === '--sqlite') use = 'sqlite'
  if (arg === '--pg') use = 'pg'

  if (use === 'pg') {
    console.log('> Levantando Postgres con Docker Compose...')
    ex('docker compose up -d db || docker-compose up -d db')
    const ok = await canConnectPg(pgUrl)
    if (!ok) {
      console.warn('! No se pudo conectar a Postgres. Se usará SQLite.')
      use = 'sqlite'
    }
  }

  if (use === 'pg') {
    fs.copyFileSync('prisma/schema.postgres.prisma', 'prisma/schema.prisma')
    env.DATABASE_URL = pgUrl
  } else {
    fs.copyFileSync('prisma/schema.sqlite.prisma', 'prisma/schema.prisma')
    env.DATABASE_URL = sqliteUrl
  }
  writeEnv(env)

  console.log(`> Usando ${use.toUpperCase()} — ejecutando Prisma...`)
  ex('npx prisma generate')
  // migrate dev para crear estructura (es idempotente en local)
  ex('npx prisma migrate dev --name init --skip-seed')
  // seed
  ex(`npx ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts`)
  console.log('> Bootstrap DB completado.')
}

main().catch(e=>{ console.error(e); process.exit(1) })
