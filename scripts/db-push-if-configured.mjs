import { spawnSync } from 'node:child_process';

const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.log('[db] Nessuna variabile database trovata: salto prisma db push.');
  process.exit(0);
}

process.env.DATABASE_URL = url;
console.log('[db] Database trovato: preparo schema Prisma sul database collegato.');
const result = spawnSync('npx', ['prisma', 'db', 'push', '--schema', 'server/prisma/schema.prisma', '--accept-data-loss'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
process.exit(result.status ?? 1);
