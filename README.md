# FairSplit

App full-stack TypeScript per gestire spese condivise con gruppi privati, account email/password, saldi, pagamenti, ricerca, scontrini e grafici.

## Avvio

```bash
cd fairsplit
nvm use 22
npm install
npm run db:push
npm run db:seed
npm run dev
```

Apri `http://localhost:5173`.

Account demo:

- `alice@example.com` / `password123`
- `bob@example.com` / `password123`
- `carla@example.com` / `password123`

## Funzioni principali

- Registrazione e login con email + password.
- Ogni utente vede nella dashboard solo i gruppi di cui è membro.
- Creazione gruppi e aggiunta membri solo tramite email già registrate.
- Spese persistenti su SQLite, modifica ed eliminazione logica.
- Split uguale o con importi esatti.
- Saldi semplificati e registrazione pagamenti.
- Ricerca spese per titolo o categoria.
- Scansione scontrini: flusso UI + endpoint OCR mock, pronto per provider reale.
- Grafici di ripartizione per categoria e per persona.
- Export CSV.
- Tutte le funzioni sono disponibili per tutti: nessun piano premium.

## Note OCR

L'endpoint `/api/tools/scan-receipt` usa `server/src/ocr.ts`. Al momento restituisce un risultato mock per lavorare offline; per passare a OCR reale basta sostituire la funzione `scanReceiptMock` con un provider come Google Vision, AWS Textract o Tesseract.


## Aggiornamento UI/OCR

Questa versione include:
- dashboard filtrata per membership: ogni utente vede solo i gruppi a cui partecipa;
- input importi come testo decimale, così non rimane più lo zero laterale nei campi prezzo;
- scansione scontrini con OCR reale tramite `tesseract.js` lato server;
- parsing automatico di negozio, valuta e totale quando l'immagine è leggibile;
- sezioni separate: Dashboard, Spese, Gruppi, Grafici;
- grafici colorati per categorie e quote per persona.

La scansione funziona meglio con foto nitide, scontrino intero, poco sfondo e buona luce. Se l'OCR non trova un totale affidabile, l'app mostra il risultato e permette di completare manualmente l'importo.

## Deploy su Vercel

Questa variante usa PostgreSQL per la produzione. Leggi `VERCEL_DEPLOY.md`.

Comandi principali:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Su Vercel:

```bash
vercel --prod
```


## Fix REQUEST_FAILED on Vercel

This version supports both `/api/*` and unprefixed serverless routes internally, because Vercel catch-all functions can expose the Express app with a different base path depending on routing. Use `/api/health`, `/api/debug`, `/health`, and `/debug` to verify the backend.

## Deploy Vercel Hobby

Questa build è compatibile con il piano Hobby: tutte le API sono consolidate nella singola Function `api/[...path].ts`.

### Nota icona Android/PWA
Questa versione usa icone PWA con nomi versionati (`fs-icon-*-v2.png`) e manifest con query `?v=2` per forzare Chrome Android a scaricare il logo aggiornato. Se avevi già aggiunto l'app alla schermata Home, rimuovila dalla Home e reinstallala; Android può mantenere in cache l'icona precedente.
