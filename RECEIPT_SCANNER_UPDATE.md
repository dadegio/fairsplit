# Aggiornamento scansioni scontrini

Questa versione modifica l'archivio scontrini in modo che non salvi più una semplice foto grezza: l'immagine caricata/scattata dal telefono viene trasformata in una scansione documentale ad alto contrasto tramite canvas nel browser.

## Novità

- Login pulito: rimossi dalla UI gli esempi `alice@example.com / password123`. Gli utenti demo restano nel seed.
- Archivio scontrini come scansioni documentali, non semplici foto.
- Ogni scansione può essere collegata opzionalmente a una spesa del gruppo.
- Ogni scansione può essere eliminata dall'archivio.
- L'archivio mostra l'eventuale spesa collegata.

## Database

È stato aggiunto il campo opzionale `expenseId` a `ReceiptArchive`. Dopo il deploy, esegui:

```bash
npm run db:push
```

Su Vercel/Neon, se usi il build script già incluso, `db:deploy` prova a sincronizzare lo schema automaticamente quando `DATABASE_URL` è presente.
