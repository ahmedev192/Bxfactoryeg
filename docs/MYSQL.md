# MySQL production migrations

For local development, SQLite + `npm run db:push` is sufficient.

For production on MySQL 8:

1. Set `DATABASE_URL=mysql://user:pass@host:3306/production_ops` in `backend/.env`
2. Change `provider` in `backend/prisma/schema.prisma` from `sqlite` to `mysql`
3. Run:

```bash
cd backend
npx prisma migrate dev --name init
# on production server:
npx prisma migrate deploy
npm run db:seed
```

See [DEPLOY.md](./DEPLOY.md) for full VPS setup.
