# Codex Master Prompt and Rules

## Master Prompt for Codex

You are building a production-ready multi-tenant SaaS platform called Restaurant Menu Builder.

Before writing code, read all files inside the `docs/` folder and treat them as the source of truth.

This is not a simple CRUD app. It is a SaaS menu website builder for restaurants and cafés.

## Core Requirements

The system must support:
- multi-tenant restaurants
- restaurant branches
- super admin dashboard
- restaurant dashboard
- menu builder
- theme builder
- custom components
- product management
- product options and extras
- product image gallery
- 3D product media
- VR/360 product media
- cart
- WhatsApp ordering
- PWA caching
- QR codes
- analytics
- SEO
- notifications
- custom domains
- white label
- subscriptions
- feature flags
- plugin architecture
- role-based permissions
- media library
- performance optimization

## Rules

1. Do not hardcode subscription plan names.
2. Use feature keys and feature flag service.
3. Scope all restaurant data by restaurantId.
4. Separate public APIs from dashboard APIs.
5. Do not expose draft menu data publicly.
6. Do not implement 3D/VR as a single view mode.
7. Products can have images, 3D and VR at the same time.
8. Use backend enforcement for locked features.
9. Use frontend locked states for upsell.
10. Keep modules independent.
11. Use DTO validation.
12. Use Prisma relations and indexes.
13. Use soft delete for important entities.
14. Build incrementally.
15. Avoid technical debt.

## Build Order

1. Project structure
2. Prisma schema
3. Auth
4. Restaurants
5. Branches
6. Permissions
7. Subscriptions
8. Feature flags
9. Products/categories
10. Public menu
11. Cart
12. WhatsApp ordering
13. Theme engine
14. Menu builder
15. PWA
16. QR
17. Analytics
18. SEO
19. 3D
20. VR
21. Domains
22. White label
23. Plugins

## Definition of Done

A feature is done only when:
- backend API exists
- DTO validation exists
- permissions are enforced
- feature flag is enforced if needed
- frontend UI exists
- locked state exists if subscription-dependent
- public behavior works if relevant
- tests are added where practical
- docs are updated

## Things Not To Do

Do not:
- build random pages without architecture
- hardcode theme colors
- hardcode plan checks
- skip tenant scoping
- put all logic in controllers
- expose unpublished data
- upload unsafe files
- ignore performance
