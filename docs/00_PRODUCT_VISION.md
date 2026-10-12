# Product Vision

## 1. Product Definition

The product is a multi-tenant SaaS platform for restaurants and cafés. It allows each restaurant owner to create a public digital menu website and customize it from a dashboard without writing code.

This is not only a menu management system. It is a full menu website builder with:
- dynamic pages
- drag-and-drop sections
- theme customization
- product management
- media management
- 3D and VR product media
- WhatsApp ordering
- PWA acceleration
- analytics
- SEO
- QR codes
- custom domains
- multi-branch support
- white-label support
- subscriptions and feature-based access

## 2. Product Positioning

The platform should be positioned as:

> A website builder and smart digital menu platform built specifically for restaurants and cafés.

It should not be positioned as a generic website builder because restaurant-specific workflows are the main value:
- menu categories
- products
- options and extras
- product availability
- branch-specific menus
- opening hours
- WhatsApp ordering
- QR menus
- mobile-first public experience
- fast loading with PWA
- restaurant analytics

## 3. Target Customers

Primary customers:
- small restaurants
- cafés
- dessert shops
- bakeries
- fast-food shops
- food trucks
- multi-branch local chains

Secondary customers:
- agencies building menu sites for restaurants
- restaurant groups
- cloud kitchens
- franchise operators

## 4. Main Product Promise

A restaurant owner should be able to:
1. Create an account or be created by the super admin.
2. Create a restaurant profile.
3. Add one or more branches.
4. Choose a template.
5. Customize theme, colors, icons, layout and pages.
6. Add products, images, options, extras, prices and availability.
7. Enable WhatsApp ordering.
8. Generate QR codes.
9. Publish the public menu.
10. Track analytics.

## 5. Key Product Principles

### 5.1 Builder-first, not CRUD-first

The dashboard should not feel like a normal admin panel only. It should feel like a builder.

Bad approach:
- User fills fields in forms only.
- Public website is fixed.
- Only products/categories can change.

Good approach:
- User builds pages with sections.
- User chooses layouts.
- User changes visual theme.
- User controls public experience.
- User publishes changes when ready.

### 5.2 Subscription-aware from day one

Features should not be hardcoded by plan names. The system must support feature keys and feature flags.

Example:
- Basic has `WHATSAPP_ORDERING`
- Pro has `PWA_MENU` and `PRODUCT_3D_VIEWER`
- Premium has `PRODUCT_VR_VIEWER`, `CUSTOM_DOMAIN`, `WHITE_LABEL`

The code should ask:
`canUseFeature(restaurantId, "PRODUCT_3D_VIEWER")`

It should not ask:
`if plan.name === "Pro"`

### 5.3 Plugin-based architecture

Advanced features should be modules/plugins:
- QR Plugin
- WhatsApp Ordering Plugin
- Analytics Plugin
- PWA Plugin
- 3D Viewer Plugin
- VR Viewer Plugin
- SEO Plugin
- Domains Plugin
- White Label Plugin
- Future AI Plugin

This allows the product to grow without turning the codebase into a mess.

### 5.4 Mobile-first public experience

Most customers open the menu by scanning QR codes from their phones. Therefore:
- mobile layout is the priority
- fast first load matters
- skeleton loading matters
- image optimization matters
- PWA caching matters
- WhatsApp integration matters

### 5.5 Multi-tenant safety

Every restaurant must see only its own data. Every backend query related to restaurant-owned data must be scoped by `restaurantId`.

Data leakage between tenants is a critical failure.

## 6. MVP vs Long-term Product

### MVP

The first production MVP should include:
- authentication
- restaurant management
- one or more branches
- products/categories
- basic menu pages
- theme settings
- public menu
- cart
- WhatsApp order
- QR code
- basic PWA caching
- subscription feature flags
- basic analytics

### Advanced Release

Later releases:
- drag-and-drop builder
- version history
- advanced themes
- custom domains
- white label
- 3D
- VR/360
- advanced analytics
- plugin marketplace
- AI content tools
- template marketplace
- import/export

## 7. What Codex Must Understand

Codex must understand that this is a SaaS platform, not a single restaurant website.

Every implementation decision must respect:
- tenant isolation
- subscription features
- plugin modularity
- public performance
- future scalability
- clean code
- typed DTOs
- Prisma relations
- backend guards
- frontend guards
