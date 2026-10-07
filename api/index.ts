// Single Vercel Function entrypoint for the whole API.
// Vercel Hobby has a Serverless Function limit, so every /api/* request is
// rewritten here by vercel.json and then forwarded to the Express app.
import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel compiles this entrypoint as CommonJS, while the server workspace is
// intentionally ESM (server/package.json has `"type": "module"`). A static
// import is therefore emitted as require(), which crashes at runtime with
// ERR_REQUIRE_ESM. Keep the import dynamic so Node loads the Express app as ESM.
let appPromise: Promise<typeof import('../server/dist/src/app.js').default> | undefined;

function loadApp() {
  appPromise ??= import('../server/dist/src/app.js').then((module) => module.default);
  return appPromise;
}

type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rebuildUrl(req: VercelRequest) {
  // vercel.json rewrites /api/auth/login to /api?path=auth/login.
  // Express must receive /api/auth/login, because server/src/app.ts mounts the router on /api.
  const rawPath = first(req.query?.path) ?? '';
  const cleanPath = String(rawPath).replace(/^\/+/, '');
  const original = new URL(req.url || '/', 'https://fairsplit.local');
  original.searchParams.delete('path');
  const qs = original.searchParams.toString();
  return `/api/${cleanPath}${qs ? `?${qs}` : ''}`;
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  req.url = rebuildUrl(req);
  const app = await loadApp();
  return app(req as any, res as any);
}
