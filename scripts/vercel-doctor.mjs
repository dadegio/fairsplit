const keys = ['DATABASE_URL','POSTGRES_PRISMA_URL','POSTGRES_URL','POSTGRES_URL_NON_POOLING','AUTH_SECRET','SESSION_SECRET'];
for (const key of keys) console.log(`${key}: ${process.env[key] ? 'set' : 'missing'}`);
