import { PrismaClient } from '@prisma/client';

const fallbackDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!process.env.DATABASE_URL && fallbackDatabaseUrl) {
  process.env.DATABASE_URL = fallbackDatabaseUrl;
}

if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
  console.warn('[db] DATABASE_URL missing. Set DATABASE_URL or connect Neon/Postgres in Vercel.');
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn']
});

export const cents = (n: number) => Math.round(n * 100);
export const money = (n: number) => Math.round(n) / 100;
