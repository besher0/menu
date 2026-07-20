# API, Frontend and Backend Structure

## 1. API Design Principles

APIs must be:
- typed
- validated
- scoped by tenant
- separated by context
- consistent in response format
- documented
- secure

## 2. API Groups

### Auth
```txt
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/forgot-password
```

### Admin
```txt
/admin/restaurants
/admin/users
/admin/subscriptions
/admin/features
/admin/plugins
/admin/themes
```

### Dashboard
```txt
/dashboard/restaurants/current
/dashboard/branches
/dashboard/menus
/dashboard/pages
/dashboard/sections
/dashboard/products
/dashboard/categories
/dashboard/theme
/dashboard/media
/dashboard/orders
/dashboard/analytics
/dashboard/domains
```

### Public
```txt
/public/menus/:restaurantSlug
/public/menus/:restaurantSlug/pages/:pageSlug
/public/menus/:restaurantSlug/products
/public/menus/:restaurantSlug/theme
/public/menus/:restaurantSlug/track
```

## 3. Response Format

Use consistent responses:

```json
{
  "data": {},
  "meta": {},
  "message": "Success"
}
```

Errors:

```json
{
  "statusCode": 403,
  "error": "FEATURE_LOCKED",
  "message": "This feature requires Pro plan",
  "featureKey": "PRODUCT_3D_VIEWER"
}
```

## 4. Frontend Structure

Recommended:

```txt
apps/web/src/
  app/
    (public)/
    dashboard/
    admin/
  components/
  features/
    auth/
    products/
    menu-builder/
    theme-builder/
    public-menu/
    analytics/
  lib/
  hooks/
  stores/
  styles/
```

## 5. Backend Structure

```txt
apps/api/src/
  modules/
    auth/
    users/
    restaurants/
    branches/
    products/
    menus/
    builder/
    themes/
    subscriptions/
    feature-flags/
    plugins/
    media/
    orders/
    whatsapp/
    analytics/
    seo/
    domains/
    qr/
  common/
    guards/
    decorators/
    filters/
    interceptors/
  prisma/
```

## 6. Shared Package

```txt
packages/shared/
  feature-keys.ts
  roles.ts
  dto-types.ts
  theme-schema.ts
  builder-section-types.ts
```

## 7. API Versioning

Use `/v1` when public API becomes stable.

## 8. Testing

Backend:
- unit tests for services
- integration tests for APIs
- permission tests
- feature flag tests

Frontend:
- component tests
- builder state tests
- public rendering tests

## 9. Codex Rule

Create the structure first before implementing many features.
