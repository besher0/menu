# System Architecture

## 1. Recommended Tech Stack

Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- React Query or TanStack Query
- Zustand or Redux Toolkit for builder state
- PWA support
- Dynamic theme rendering with CSS variables

Backend:
- NestJS
- TypeScript
- Prisma
- PostgreSQL
- JWT authentication
- RBAC guards
- Feature flag guards
- Modular architecture

Storage:
- Local storage for development
- Later S3-compatible provider, Bunny Storage, Cloudflare R2, or AWS S3
- CDN for public media

Cache:
- Redis recommended later
- HTTP caching for public menu
- PWA service worker cache

## 2. High-Level Architecture

```txt
apps/
  web/           Next.js public website + dashboards
  api/           NestJS API
packages/
  shared/        shared types/constants
  ui/            reusable UI components
  config/        shared config
docs/
```

Alternative:
Use separate repos if the team grows, but monorepo is easier at the beginning.

## 3. Backend Layers

Each module should follow:

```txt
module/
  controllers/
  services/
  dto/
  entities or types/
  guards/
  repositories/
```

Recommended Nest modules:
- AuthModule
- UsersModule
- RestaurantsModule
- BranchesModule
- MenusModule
- MenuBuilderModule
- ThemeModule
- ProductsModule
- MediaModule
- OrdersModule
- WhatsAppModule
- QRModule
- PwaModule
- AnalyticsModule
- SeoModule
- DomainsModule
- SubscriptionsModule
- FeatureFlagsModule
- PluginsModule
- NotificationsModule
- AuditLogsModule

## 4. Multi-Tenant Design

Every tenant-owned model must contain:
- `restaurantId`
or
- `branchId` plus relation to restaurant

Critical rule:
Every restaurant dashboard query must be scoped by restaurantId.

Example:

```ts
await prisma.product.findMany({
  where: {
    restaurantId: currentRestaurantId,
    deletedAt: null
  }
})
```

Never trust IDs from the client alone.

## 5. Public vs Dashboard API

Separate public APIs from dashboard APIs.

Public API:
```txt
/public/menus/:restaurantSlug
/public/menus/:restaurantSlug/products
/public/menus/:restaurantSlug/theme
```

Dashboard API:
```txt
/dashboard/products
/dashboard/theme
/dashboard/pages
```

Admin API:
```txt
/admin/restaurants
/admin/subscriptions
/admin/plugins
```

This improves security and clarity.

## 6. Draft and Publish Architecture

Builder changes should not always publish immediately.

Recommended:
- draft version
- published version
- version history
- rollback support

Example:
- Restaurant edits menu layout.
- Changes are saved as draft.
- Public website still shows published version.
- Restaurant clicks Publish.
- Draft becomes published.

## 7. Event-driven Thinking

Some actions should produce events:
- product created
- product viewed
- WhatsApp order clicked
- menu published
- QR scanned
- subscription expired
- domain verified

Later these events can feed:
- analytics
- notifications
- audit logs
- background jobs

## 8. Plugin Architecture

Plugins should register:
- feature key
- backend routes
- dashboard component
- public renderer component
- permissions
- config schema

Example:
3D Plugin:
- feature key: `PRODUCT_3D_VIEWER`
- media type: `MODEL_3D`
- dashboard upload component
- public viewer component

## 9. Why Plugin Architecture Is Important

Without plugins, every new feature adds code directly into the core product.

That becomes hard to maintain.

With plugin architecture:
- core remains stable
- features are modular
- subscription access is easier
- future marketplace is possible

## 10. Recommended Build Order

Do not build visual builder first.

Correct order:
1. Database schema
2. Auth
3. Restaurants and branches
4. Feature flags/subscriptions
5. Products/categories
6. Public menu
7. Cart + WhatsApp
8. Theme system
9. Builder system
10. PWA
11. Analytics
12. 3D/VR
13. Domains/White label
