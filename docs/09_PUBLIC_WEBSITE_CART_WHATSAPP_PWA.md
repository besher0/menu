# Public Website, Cart, WhatsApp Ordering and PWA

## 1. Public Website Goal

The public menu website should be:
- fast
- mobile-first
- SEO-friendly
- installable as PWA
- dynamic by restaurant theme
- dynamic by menu builder
- optimized for QR scans
- ready for WhatsApp ordering

## 2. Public Routes

Recommended:
```txt
/m/[restaurantSlug]
/m/[restaurantSlug]/[pageSlug]
/m/[restaurantSlug]/branch/[branchSlug]
```

Custom domain later:
```txt
https://restaurant-domain.com
```

## 3. Public Data Rules

Public site must only show:
- active restaurant
- active branch
- published menu
- published pages
- active sections
- active products
- available media based on subscription

No drafts.

## 4. Cart Requirements

Cart features:
- add product
- remove product
- increase/decrease quantity
- choose product options
- add item notes
- add general order note
- show subtotal
- show total
- persist in localStorage
- scope cart by restaurant and branch
- clear after WhatsApp send if desired

Cart localStorage key:
```txt
cart:{restaurantSlug}:{branchSlug}
```

## 5. WhatsApp Ordering

Each restaurant/branch has a WhatsApp phone number.

When customer sends order:
- build formatted message
- URL encode it
- open WhatsApp

URL:
```txt
https://wa.me/{phone}?text={encodedMessage}
```

## 6. WhatsApp Message Format

Example:

```txt
New Order from Pizza Palace

Branch: City Center
Customer: Ali
Phone: +49...

Items:
1x Margherita Pizza - Medium
Extras: Cheese, Mushrooms
Note: No onions
Price: 12.50 EUR

2x Cola
Price: 4.00 EUR

Total: 16.50 EUR

Order Note:
Please prepare for pickup.

Time:
2026-06-30 18:45
```

## 7. Order Tracking

Recommended:
Before redirecting to WhatsApp, create an order record:
- status: PENDING_WHATSAPP
- source: WHATSAPP
- cart snapshot
- message
- restaurantId
- branchId

After click:
- status may become SENT_TO_WHATSAPP
- exact delivery confirmation cannot be guaranteed because WhatsApp is external

## 8. PWA Goal

PWA should make the public menu feel instant after first visit.

Features:
- manifest
- service worker
- offline menu cache
- app install
- cached images
- cached theme
- cached products/categories
- stale-while-revalidate
- skeleton loading

## 9. Caching Strategy

Static assets:
- cache-first

Images:
- cache-first with expiration

Menu data:
- stale-while-revalidate or network-first with fallback

Cart:
- localStorage

WhatsApp:
- requires internet

## 10. Offline Behavior

If offline:
- show cached restaurant menu
- allow browsing
- allow cart editing
- disable/send warning for WhatsApp send

## 11. Loading Experience

Use:
- skeleton product cards
- category skeleton
- progressive image loading
- low-quality placeholders

## 12. Mobile UX

Important:
- sticky cart button
- fast category navigation
- bottom sheet product details
- large tap targets
- readable typography
- language switcher

## 13. Codex Rule

Public website performance is a primary feature, not an afterthought.
