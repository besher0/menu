# Authentication, Permissions and Security

## 1. Authentication

Use JWT authentication.

Recommended flows:
- Super admin login
- Restaurant user login
- Refresh tokens
- Password reset
- Email verification later

User identity should be separate from restaurant membership.

A user may belong to multiple restaurants.

## 2. Authorization Levels

There are two layers:

### Global Role

```ts
SUPER_ADMIN
USER
```

### Restaurant Role

```ts
OWNER
MANAGER
EDITOR
EMPLOYEE
```

## 3. Permission Matrix

Permissions should be feature/action based.

Examples:
- `restaurant.update`
- `branch.create`
- `product.create`
- `product.update`
- `theme.update`
- `menu.publish`
- `analytics.view`
- `subscription.manage`
- `domain.manage`
- `white_label.manage`

Roles map to permissions.

Owner:
- all restaurant permissions

Manager:
- manage products, branches, menus, analytics

Editor:
- edit products/pages/theme but not billing

Employee:
- limited product availability or order view

## 4. Guards

NestJS guards:
- JwtAuthGuard
- GlobalRoleGuard
- RestaurantMemberGuard
- RestaurantPermissionGuard
- FeatureFlagGuard

## 5. Tenant Security

Every dashboard request must resolve current restaurant context safely.

Do not accept `restaurantId` blindly.

Recommended:
- route parameter or header selects restaurant
- backend checks user membership
- backend scopes all queries

## 6. Upload Security

Uploads are risky.

Validate:
- file type
- extension
- MIME type
- file size
- image dimensions
- model format
- virus scan later

Allowed:
- images: jpg, png, webp, avif
- 3D: glb, gltf
- VR: jpg/webp panoramas

Do not allow executable files.

## 7. XSS Protection

Because builder sections may store JSON and custom content:
- never render unsafe HTML by default
- sanitize custom HTML if supported
- restrict custom CSS
- use CSP headers
- escape user content

## 8. Rate Limiting

Apply rate limits to:
- login
- password reset
- public analytics events
- WhatsApp click endpoint
- file uploads
- public APIs

## 9. Audit Logs

Track sensitive actions:
- login
- restaurant updated
- user invited
- role changed
- subscription changed
- domain added
- menu published
- product deleted
- feature toggled

## 10. Security Headers

Use:
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

## 11. Public API Security

Public menu APIs do not require auth, but they still need protection:
- rate limit
- cache
- return only published data
- hide draft/private data
- no internal subscription details
- no sensitive restaurant data

## 12. Soft Deletes

Use soft delete for:
- restaurants
- products
- categories
- pages
- branches

This prevents accidental data loss.

## 13. Backup Strategy

Future:
- database backups
- media backup
- restore procedure
- export menu as JSON
