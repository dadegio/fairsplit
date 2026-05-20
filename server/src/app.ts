import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes.js';

export const app = express();

app.set('json replacer', (key: string, value: unknown) => key === 'passwordHash' ? undefined : value);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const debugPayload = () => ({
  ok: true,
  node: process.version,
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING),
  databaseVariable: process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.POSTGRES_PRISMA_URL ? 'POSTGRES_PRISMA_URL' : process.env.POSTGRES_URL ? 'POSTGRES_URL' : process.env.POSTGRES_URL_NON_POOLING ? 'POSTGRES_URL_NON_POOLING' : null,
  hasAuthSecret: Boolean(process.env.AUTH_SECRET || process.env.SESSION_SECRET),
  env: process.env.VERCEL ? 'vercel' : process.env.NODE_ENV ?? 'development',
  note: 'API can be reached with both /api/* and /* routes'
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'fairsplit' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'fairsplit' }));
app.get('/auth/health', (_req, res) => res.json({ ok: true, route: 'single catch-all API active' }));
app.get('/api/auth/health', (_req, res) => res.json({ ok: true, route: 'single catch-all API active' }));
app.get('/debug', (_req, res) => res.json(debugPayload()));
app.get('/api/debug', (_req, res) => res.json(debugPayload()));
/* old debug inline removed */
app.get('/__old_debug_removed__', (_req, res) => res.json({
  removed: true
}));

// Vercel catch-all functions may pass the request URL either as
// /api/auth/register or as /auth/register depending on routing/basePath.
// Supporting both forms prevents the frontend from getting generic
// REQUEST_FAILED/404 errors when deployed.
app.use('/api', router);
app.use('/', router);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);

  // Errori frequenti in produzione Vercel/Neon: database collegato ma schema non ancora creato.
  const msg = String(err?.message ?? '');
  if (err?.code === 'P2021' || msg.includes('does not exist') || msg.includes('relation') && msg.includes('does not exist')) {
    return res.status(503).json({ error: 'DATABASE_SCHEMA_NOT_READY' });
  }
  if (err?.code === 'P1001' || err?.code === 'P1017' || msg.includes('Environment variable not found: DATABASE_URL')) {
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'EMAIL_ALREADY_REGISTERED' });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: err.errors?.[0]?.message ?? 'VALIDATION_ERROR' });
  }

  res.status(err.status ?? 400).json({ error: err.message ?? 'Bad Request' });
});

export default app;
