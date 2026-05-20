# FairSplit deploy su Vercel Hobby

Questa versione usa UNA SOLA Serverless Function:

- `api/[...path].ts`

Serve per restare sotto il limite Hobby di Vercel.

## Impostazioni Vercel

- Root Directory: vuota
- Install Command: `npm install`
- Build Command: `npm run build:vercel`
- Output Directory: `web/dist`

## Environment Variables

Obbligatorie:

- `DATABASE_URL`
- `AUTH_SECRET`

Non impostare `VITE_API_URL` in produzione.

## URL di test

Dopo il deploy apri:

- `/api/health`
- `/api/debug`
- `/api/auth/health`

Poi testa:

1. registrazione
2. login
3. creazione gruppo
4. aggiunta membro
5. creazione spesa
6. grafici

## Fix Hobby definitivo
Questa versione usa una sola Vercel Function: `api/index.ts`.
Tutte le chiamate `/api/*` vengono riscritte a `/api?path=...` e poi inoltrate al router Express interno.
Questo evita sia il limite delle 12 Function del piano Hobby sia i 405/REQUEST_FAILED causati da catch-all ambigui.
