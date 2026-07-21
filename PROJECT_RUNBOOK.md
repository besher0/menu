# Restaurant Menu Builder Runbook

## Required Local Keys

Minimum required for development:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"
JWT_SECRET="long-random-secret"
PORT=5010
API_ORIGIN="http://localhost:5010"
WEB_ORIGIN="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:5010"
NEXT_PUBLIC_WEB_URL="http://localhost:3000"
DOMAIN_VERIFY_BYPASS="true"
```

Production or optional keys:

```env
DOMAIN_VERIFY_BYPASS="false"
```

Future storage keys if you move uploads from local disk to object storage:

```env
STORAGE_PROVIDER="s3"
S3_ENDPOINT=""
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE_URL=""
```

Future monitoring keys:

```env
SENTRY_DSN=""
LOG_LEVEL="info"
```

## First Setup

Install dependencies:

```powershell
npm install
```

Generate Prisma client:

```powershell
npm run prisma:generate
```

Push schema to database:

```powershell
npx prisma db push --schema .\apps\api\prisma\schema.prisma
```

Seed demo data:

```powershell
npm run seed
```

## Run The Project

Run API:

```powershell
npm run dev:api
```

Run Web:

```powershell
npm run dev:web
```

Open:

```txt
http://localhost:3000/login
```

Demo accounts seeded by the project:

```txt
admin@menu.test / password123
owner@abomalek.test / password123
```

Useful pages:

```txt
http://localhost:3000/admin
http://localhost:3000/admin/restaurants/new
http://localhost:3000/dashboard
http://localhost:3000/dashboard/products
http://localhost:3000/dashboard/media
http://localhost:3000/dashboard/builder
http://localhost:3000/dashboard/theme
http://localhost:3000/dashboard/branches
http://localhost:3000/dashboard/qr
http://localhost:3000/dashboard/domains
http://localhost:3000/m/abo-malek
```

## Add Data

1. Login as `admin@menu.test`.
2. Open `/admin/restaurants/new`.
3. Create a restaurant with owner email and plan.
4. Login as the owner or stay as super admin.
5. Add branches from `/dashboard/branches`.
6. Add products from `/dashboard/products/new`.
7. Add images, 3D models, or VR panoramas from `/dashboard/media`.
8. Customize theme from `/dashboard/theme`.
9. Build sections from `/dashboard/builder`.
10. Generate QR codes from `/dashboard/qr`.
11. Add custom domains from `/dashboard/domains`.

## Media Uploads

Local uploads are served by the API at:

```txt
http://localhost:5010/uploads/<filename>
```

The local upload folder is:

```txt
apps/api/uploads
```

For production, replace local uploads with S3 or another object storage provider.

## Domain Verification

For local development:

```env
DOMAIN_VERIFY_BYPASS="true"
```

For production:

```env
DOMAIN_VERIFY_BYPASS="false"
```

Then add the generated TXT token to DNS for the custom domain before clicking verify.
