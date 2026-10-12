# Restaurant Menu Builder SaaS

MVP implementation for the SaaS described in `docs/`.

For full setup, run instructions, data entry flow, and required keys, see `PROJECT_RUNBOOK.md`.

## Stack

- `apps/web`: Next.js app for public menu, restaurant dashboard, and super admin.
- `apps/api`: NestJS API with Prisma and JWT auth.
- `packages/shared`: shared feature keys, roles, theme contracts, and demo data.

## Setup

```bash
npm install
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
npm run prisma:generate
```

Set `DATABASE_URL` in `apps/api/.env` to your external PostgreSQL database, then run:

```bash
npx prisma db push --schema apps/api/prisma/schema.prisma
npm run seed
npm run dev
```

Default seeded users:

- Super admin: `admin@menu.test` / `password123`
- Restaurant owner: `owner@abomalek.test` / `password123`

Main routes:

- Login: `http://localhost:3000/login`
- Public menu: `http://localhost:3000/m/abo-malek`
- Restaurant dashboard: `http://localhost:3000/dashboard`
- Super admin: `http://localhost:3000/admin`
- API health: `http://localhost:5000/health`

The web app includes a demo-login button so the interface can be reviewed before the external PostgreSQL database is configured.
