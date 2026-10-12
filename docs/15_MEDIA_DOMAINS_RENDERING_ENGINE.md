# Media, Domains & Rendering Engine Specification

## Purpose

This document defines the architecture, requirements, and implementation rules for all media-related features, image optimization, icon rendering, custom domains, hybrid cloud architecture, and rendering performance.

This document is part of the Restaurant Menu Builder SaaS documentation and must be treated as the source of truth for these systems.

---

## 1. Media System Philosophy

The platform must never treat uploaded media as static files.

Every uploaded image becomes a managed asset inside the Media Engine.

The Media Engine is responsible for:

- image optimization
- image processing
- responsive images
- storage
- CDN delivery
- progressive loading
- metadata extraction
- future AI enhancements

The original uploaded file should almost never be served directly to customers.

---

## 2. Media Library

Every restaurant owns a private Media Library.

Media can be reused by:

- Products
- Categories
- Pages
- Hero banners
- Gallery sections
- Custom Components
- Theme assets
- Logos
- Icons

Each media item should contain:

- id
- restaurantId
- filename
- original filename
- mime type
- width
- height
- file size
- storage provider
- uploadedBy
- createdAt
- updatedAt

Media should never be duplicated unnecessarily.

Products should reference Media IDs instead of storing file URLs directly.

---

## 3. Image Upload Pipeline

Every uploaded image must go through a processing pipeline.

Upload Flow:

1. User uploads image.
2. Validate file.
3. Store original.
4. Generate optimized versions.
5. Extract metadata.
6. Save Media record.
7. Return Media ID.

Supported formats:

- JPG
- PNG
- WEBP
- AVIF

Future:

- HEIC
- SVG, restricted

Maximum upload size should be configurable from the admin dashboard.

---

## 4. Image Optimization

The system must automatically generate multiple image sizes.

Required variants:

- Original
- Thumbnail
- Small
- Medium
- Large
- WebP
- AVIF
- Blur Placeholder

Example:

```txt
Original: 4096 x 3072
Large:    1920 x 1440
Medium:   1280 x 960
Small:     640 x 480
Thumbnail: 200 x 150
Blur:       40 x 30
```

---

## 5. Configurable Image Rules

The platform administrator must be able to define image rules.

Example rule fields:

- Maximum Width
- Maximum Height
- JPEG Quality
- WEBP Quality
- Crop Mode
- Aspect Ratio
- Generate AVIF
- Generate WEBP
- Lazy Load
- Progressive Load

These rules should be configurable separately for:

- Product Images
- Category Images
- Hero Images
- Gallery Images
- Logos
- Icons

---

## 6. Progressive Image Loading

Images must never load at full resolution immediately.

Rendering sequence:

1. Blur Placeholder
2. Small Image
3. Medium Image
4. Large Image, only when required

Benefits:

- Faster perceived loading
- Better Lighthouse score
- Better mobile experience
- Reduced bandwidth usage

---

## 7. Responsive Images

The frontend must automatically choose the correct image size depending on the device.

Example:

- Mobile: Small Image
- Tablet: Medium Image
- Desktop: Large Image

Never send a 4K image to a mobile phone.

---

## 8. Lazy Loading

All images below the fold must use lazy loading.

Only visible images should be downloaded immediately.

Images should preload only when likely to become visible.

---

## 9. Full Screen Preview

Only when the customer opens a full-screen image should the original image be loaded.

Otherwise use optimized versions.

---

## 10. Image Storage

Storage must be provider-independent.

Supported providers:

- Local Storage
- Bunny Storage
- AWS S3
- Cloudflare R2
- Future providers

The storage provider should be replaceable without changing business logic.

---

## 11. CDN

Images should always be delivered through CDN in production.

Benefits:

- lower latency
- lower bandwidth usage
- better caching
- global performance

---

## 12. Icon Rendering Engine

The platform must support complete icon customization.

Do not limit icons to:

- Top
- Bottom
- Left
- Right

Instead every icon instance should support:

- Width
- Height
- X Position
- Y Position
- Scale
- Rotation
- Opacity
- Z Index
- Color
- Background Color
- Border Radius
- Shadow
- Visibility
- Device-specific settings

---

## 13. Device Specific Icon Layout

Icons should support different settings for:

- Mobile
- Tablet
- Desktop

Example:

- Desktop: 48 x 48
- Mobile: 32 x 32

These settings must not affect each other.

---

## 14. Icon Sources

Supported sources:

- Library Icons
- Uploaded SVG
- Uploaded PNG
- Future animated icons

---

## 15. Icon JSON Structure

Every icon configuration should be stored as JSON.

Example:

```json
{
  "name": "coffee",
  "width": 42,
  "height": 42,
  "x": 14,
  "y": 10,
  "scale": 1.2,
  "rotation": 0,
  "opacity": 1,
  "zIndex": 5,
  "color": "#111827",
  "backgroundColor": "#ffffff"
}
```

---

## 16. Theme Integration

The Theme Builder must control:

- Icon colors
- Default icon size
- Hover effects
- Animations
- Rounded backgrounds
- Shadow presets

Icons must inherit theme values unless overridden locally.

---

## 17. Custom Domains

Restaurants should be able to use their own domains.

Supported examples:

- restaurant.yourplatform.com
- menu.restaurant.com
- restaurant.com

The customer must only see the restaurant's domain.

---

## 18. Domain Workflow

Domain workflow:

1. Restaurant enters domain.
2. Status is set to PENDING.
3. Platform provides DNS records.
4. Restaurant configures DNS.
5. Platform verifies DNS.
6. SSL Certificate is generated.
7. Status is set to VERIFIED.
8. Domain becomes ACTIVE.

---

## 19. Domain States

Recommended states:

- PENDING
- DNS_VERIFIED
- SSL_PENDING
- SSL_ACTIVE
- ACTIVE
- FAILED
- DISABLED

---

## 20. Domain Verification

The backend should verify:

- DNS
- Ownership
- SSL availability
- Duplicate usage

No domain should belong to more than one restaurant.

---

## 21. Host Based Tenant Resolution

Every request should resolve the tenant using the Host header.

Example:

```txt
menu.restaurant.com -> Restaurant A
restaurant.com -> Restaurant A
restaurant.yourplatform.com -> Restaurant A
```

The application should be shared.

Never deploy one application per restaurant.

---

## 22. SSL

SSL must be automatic.

Recommended:

- Caddy

Alternatives:

- Let's Encrypt
- Cloudflare

The restaurant should never manually install certificates.

---

## 23. Hybrid Cloud Architecture

The platform should support Hybrid Mode.

Cloud Server stores:

- central database
- backups
- subscriptions
- analytics
- synchronization
- notifications

Local Server runs:

- API
- database
- dashboard
- public menu
- POS integration

Local devices:

- Kitchen
- POS
- Tablets
- Customer phones

must continue working even if the internet is unavailable.

---

## 24. Synchronization Engine

Synchronization should be asynchronous.

Types:

- Products
- Categories
- Menus
- Orders
- Theme
- Media
- Settings
- Analytics

Sync should support:

- Push
- Pull
- Retry
- Queue
- Conflict Resolution
- Versioning
- Soft Deletes

---

## 25. Offline First

If internet is unavailable:

- Restaurant continues working.
- Public menu continues working.
- Cart continues working.

When internet returns:

- Synchronization resumes automatically.

---

## 26. PWA Rendering Strategy

The public menu should behave like a native application.

Required:

- Manifest
- Service Worker
- Offline Cache
- Background Sync
- Skeleton Loading
- Stale While Revalidate
- Responsive Images
- Install Prompt

---

## 27. Rendering Performance

Target goals:

- Instant page navigation
- Minimal layout shift
- Fast Largest Contentful Paint
- Fast First Contentful Paint
- Excellent Lighthouse scores
- Mobile-first optimization

---

## 28. Future Enhancements

The architecture should allow future support for:

- AI image enhancement
- Automatic background removal
- Automatic image tagging
- Smart image cropping
- Animated icons
- Vector optimization
- Video thumbnails
- WebGPU rendering
- Advanced CDN optimization

---

## 29. Codex Implementation Rules

Codex must follow these rules:

1. Never serve original uploaded images by default.
2. Always generate optimized image variants.
3. Use responsive image loading.
4. Use progressive loading.
5. Store media separately from business entities.
6. Keep storage provider independent.
7. Build a reusable Media Engine.
8. Build a reusable Icon Rendering Engine.
9. Resolve restaurants using the Host header.
10. Support both platform subdomains and custom domains.
11. Design Hybrid Cloud support from the beginning.
12. Keep synchronization modular and independent.
13. Prioritize mobile performance.
14. Treat performance as a core feature, not an optimization.
15. Build every part so it can scale to thousands of restaurants without architectural changes.

---

## Conclusion

The Media, Domains & Rendering Engine is a core architectural subsystem of the Restaurant Menu Builder SaaS platform.

Its responsibilities include media management, image optimization, icon rendering, domain routing, hybrid deployment support, synchronization, and high-performance rendering.

Every implementation must prioritize scalability, maintainability, performance, and an excellent mobile user experience.
