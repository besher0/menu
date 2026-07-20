# Development Roadmap

## Phase 1: Foundation

Goals:
- monorepo setup
- backend setup
- frontend setup
- database
- Prisma
- auth
- roles
- restaurants

Deliverables:
- working login
- super admin can create restaurant
- restaurant owner can access dashboard

## Phase 2: Multi-Tenant Core

Goals:
- restaurant membership
- branch management
- tenant scoping
- permissions
- audit logs

Deliverables:
- each user sees only allowed restaurants
- branch CRUD
- permission checks

## Phase 3: Subscriptions and Feature Flags

Goals:
- plans
- features
- limits
- canUseFeature service
- locked frontend states

Deliverables:
- Basic/Pro/Premium plans
- backend feature enforcement
- frontend upsell UI

## Phase 4: Products and Media

Goals:
- categories
- products
- options
- extras
- images
- media library

Deliverables:
- restaurant can build product catalog
- public API can read products

## Phase 5: Public Menu MVP

Goals:
- public route
- theme rendering
- categories/products
- mobile-first layout
- branch selection

Deliverables:
- `/m/[slug]` public menu works

## Phase 6: Cart and WhatsApp Ordering

Goals:
- cart
- localStorage
- option selection
- WhatsApp message
- order record

Deliverables:
- customer can send WhatsApp order

## Phase 7: Theme Builder

Goals:
- theme JSON
- CSS variables
- presets
- live preview

Deliverables:
- restaurant can customize visual identity

## Phase 8: Menu Builder

Goals:
- pages
- sections
- drag/drop
- draft/publish
- preview
- version history

Deliverables:
- restaurant can build menu website visually

## Phase 9: PWA

Goals:
- manifest
- service worker
- caching
- offline fallback
- installable app

Deliverables:
- public menu loads faster after first visit

## Phase 10: QR, SEO, Analytics

Goals:
- QR codes
- analytics events
- SEO fields
- sitemap
- Open Graph

Deliverables:
- restaurant can track visits and share QR

## Phase 11: 3D and VR

Goals:
- 3D media upload
- VR media upload
- public viewers
- feature flag enforcement

Deliverables:
- Pro/Premium media features work

## Phase 12: Domains and White Label

Goals:
- custom domain verification
- branding removal
- favicon/meta customization

Deliverables:
- Premium restaurants can use branded experience

## Phase 13: Plugin Expansion

Goals:
- plugin registry
- plugin settings
- plugin components
- marketplace-ready architecture

Deliverables:
- advanced features become modular plugins

## Phase 14: Production Hardening

Goals:
- testing
- security
- monitoring
- backups
- CI/CD
- deployment docs
- performance audit

Deliverables:
- production-ready SaaS
