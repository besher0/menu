# Analytics, SEO, Notifications and Performance

## 1. Analytics Goals

Restaurants should understand:
- how many people visit
- what products are viewed
- what products are ordered/clicked
- how many WhatsApp orders started
- QR usage
- device breakdown
- branch performance
- conversion rate

## 2. Analytics Events

Recommended events:
- MENU_VIEWED
- PAGE_VIEWED
- PRODUCT_VIEWED
- CATEGORY_VIEWED
- ADD_TO_CART
- REMOVE_FROM_CART
- WHATSAPP_ORDER_CLICKED
- QR_OPENED
- LANGUAGE_CHANGED
- BRANCH_SELECTED
- THREE_D_VIEW_OPENED
- VR_VIEW_OPENED

## 3. Analytics Dashboard

Basic analytics:
- visits
- WhatsApp clicks
- top products

Advanced analytics:
- conversion funnel
- branch comparison
- device/country
- time range comparison
- product performance
- QR campaign tracking

## 4. SEO

Each restaurant/menu/page should support:
- meta title
- meta description
- Open Graph image
- canonical URL
- favicon
- robots
- sitemap
- structured data

## 5. Structured Data

Use JSON-LD for:
- Restaurant
- Menu
- Product
- LocalBusiness
- OpeningHours

## 6. Notifications

Notifications can be:
- in-app
- email later
- dashboard banners

Examples:
- subscription ending soon
- feature locked
- domain verification failed
- menu publish successful
- storage limit reached
- new plugin available
- analytics milestone

## 7. Performance Strategy

Public website:
- SSR/ISR where useful
- CDN caching
- compressed images
- lazy loading
- skeleton loading
- cache API responses
- reduce JavaScript
- optimize fonts
- prefetch important routes

Dashboard:
- pagination
- virtual lists
- optimistic updates
- background refetch
- debounced builder saving

Backend:
- indexes
- query optimization
- Redis cache later
- background jobs
- avoid N+1 queries

## 8. Image Performance

Generate:
- thumbnail
- medium
- large
- WebP
- AVIF

Use responsive image sizes.

## 9. Monitoring

Future:
- error tracking
- logs
- uptime checks
- performance metrics
- slow query logs

## 10. Codex Rule

Performance must be designed from the beginning, especially for the public menu because users arrive from QR codes and expect instant loading.
