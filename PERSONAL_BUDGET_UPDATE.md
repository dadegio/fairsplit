# Aggiornamento budget personale

Questa versione aggiunge una home personale separata dalle spese condivise.

## Cosa cambia

- budget consigliato per i prossimi sette giorni;
- disponibile fino a fine mese e media giornaliera;
- entrate mensili e obiettivo di risparmio;
- spese personali rapide, non collegate ai gruppi;
- spese fisse e abbonamenti con prossima scadenza;
- lista desideri con priorità e confronto con il disponibile;
- nuova grafica verde/avorio più sobria;
- gruppi, debiti, scontrini e grafici condivisi restano disponibili.

## Primo aggiornamento del database

Il nuovo codice introduce quattro tabelle Prisma. Prima del primo deploy esegui:

```bash
npm install
vercel env pull .env
npm run db:push
npm run build
```

`db:push` aggiunge le nuove tabelle senza cancellare gruppi e spese già presenti.

## Deploy

Dopo avere verificato la build:

```bash
git add .
git commit -m "feat: add personal monthly budget dashboard"
git push
```

Vercel userà la configurazione già presente nel progetto.

## Come viene calcolato il budget

Il disponibile personale è:

```text
entrate - risparmio desiderato - spese fisse - spese personali del mese
```

Il budget settimanale distribuisce il disponibile sui giorni rimasti nel mese e mostra la quota relativa ai prossimi sette giorni. Le spese e i debiti dei gruppi non entrano in questo calcolo.
