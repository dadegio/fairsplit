# Deploy FairSplit su Vercel

## Impostazioni progetto Vercel

Se il repository GitHub si chiama `fairsplit` e contiene direttamente `package.json`, `vercel.json`, `api/`, `web/`, `server/` e `packages/`, lascia **Root Directory vuota**.

Usa:

- Framework Preset: Vite
- Install Command: `npm install`
- Build Command: `npm run build:vercel`
- Output Directory: `web/dist`

## Variabili ambiente

Aggiungi in Production, Preview e Development:

```txt
DATABASE_URL=postgresql://...
AUTH_SECRET=stringa-lunga-casuale
```

Per generare AUTH_SECRET:

```bash
openssl rand -base64 32
```

## Database

Dopo aver collegato Neon e fatto il primo deploy:

```bash
vercel login
vercel link
vercel env pull .env
npm install
npm run db:push
```

Opzionale:

```bash
npm run db:seed
```

## Nota root directory

Non impostare `server` o `web` come Root Directory: Vercel deve vedere il monorepo completo.


## Build fix
Se Vercel mostra `tsc: command not found`, assicurati che Install Command sia `npm install` e Build Command sia `npm run build:vercel`. Questa versione include TypeScript tra le dipendenze installabili in produzione.


## Vercel settings definitive
Root Directory: empty unless the repository contains this app inside a subfolder. Build Command: `npm run build:vercel`. Install Command: `npm install`. Output Directory: `web/dist`. If Vercel still shows a workspace name before `build:vercel`, the Root Directory or Build Command is pointing to a workspace; reset it to the repository root.

## Fix registrazione account

Questa versione usa `AUTH_SECRET` come chiave di firma sessione. Su Vercel aggiungi:

```txt
AUTH_SECRET=<stringa lunga casuale>
```

Se hai collegato Neon ma la creazione account restituisce errore, il database probabilmente non ha ancora le tabelle. Questa versione esegue automaticamente `prisma db push` durante il build Vercel quando `DATABASE_URL` è presente. In alternativa puoi eseguire manualmente:

```bash
vercel env pull .env
npm run db:push
```

## Mobile

La UI mobile è stata rifatta con barra di navigazione in basso, header sticky, card responsive e pulsanti più grandi per touch.


## Debug veloce account/register

Dopo il deploy apri questi URL sul dominio Vercel:

- `/api/health` deve rispondere `{ ok: true }`
- `/api/debug` deve mostrare `hasDatabaseUrl: true` e idealmente `hasAuthSecret: true`

Se `hasDatabaseUrl` è `false`, copia la connection string Neon in una variabile `DATABASE_URL` su Vercel.
Se il signup risponde `DATABASE_SCHEMA_NOT_READY`, esegui:

```bash
vercel env pull .env
npm run db:push
```

## Fix 405 su `/api/auth/login`

Questa versione aggiunge funzioni Vercel esplicite per:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/health`

Quindi login e registrazione non dipendono più dal catch-all Express `/api/[...path].ts`.
Dopo il deploy prova prima:

```txt
https://TUO-DOMINIO.vercel.app/api/auth/health
```

Deve rispondere JSON. Poi prova registrazione/login.
