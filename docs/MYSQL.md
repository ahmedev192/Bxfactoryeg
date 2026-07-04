# MySQL production migrations

The Prisma datasource is MySQL. Use Docker MySQL locally or a managed/self-hosted MySQL 8 instance in production.

For production on MySQL 8:

1. Set `DATABASE_URL=mysql://user:pass@host:3306/production_ops` in `backend/.env`.
2. Generate Prisma client and apply committed migrations:

```bash
cd backend
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Use `npm run db:migrate` only while creating new development migrations. Production deploys must use `npm run db:migrate:deploy`.

See [DEPLOY.md](./DEPLOY.md) for full VPS setup.
