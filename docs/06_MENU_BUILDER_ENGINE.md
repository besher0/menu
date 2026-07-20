# Menu Builder Engine

## 1. Goal

The Menu Builder is the heart of the platform.

It should allow restaurant owners to build a public menu website, not only manage products.

## 2. Builder Concept

A public menu website consists of:
- restaurant
- branch
- menu
- pages
- sections
- components
- settings
- published version

## 3. Page Types

Possible pages:
- Home
- Menu
- About
- Contact
- Offers
- Gallery
- Branches
- Custom page

## 4. Section Types

Core sections:
- Hero Banner
- Category Grid
- Featured Products
- Product List
- Product Carousel
- Gallery
- About Us
- Opening Hours
- Contact
- Location Map
- Reviews
- Offers
- QR Code
- Social Links
- Custom Component

## 5. Section JSON Settings

Each section stores settings as JSON.

Example Hero section:

```json
{
  "title": "Welcome to Pizza Palace",
  "subtitle": "Fresh pizza every day",
  "backgroundImageUrl": "...",
  "buttonText": "View Menu",
  "buttonTarget": "#menu",
  "alignment": "center",
  "height": "large"
}
```

## 6. Drag and Drop

The dashboard should allow:
- reorder sections
- add section
- duplicate section
- delete section
- hide/show section
- edit section settings

Use a stable sort order.

## 7. Draft and Publish

Do not publish every change immediately.

Recommended workflow:
1. User edits draft.
2. User previews draft.
3. User clicks Publish.
4. Public site receives new version.

## 8. Version History

Every publish creates a version.

Version includes:
- pages
- sections
- theme snapshot
- timestamp
- publisher user
- optional note

This allows rollback.

## 9. Rollback

User can restore a previous version.

Rollback creates a new draft or published version.

Do not overwrite history.

## 10. Builder State Management

Frontend builder may use Zustand.

State contains:
- selected page
- selected section
- draft sections
- unsaved changes
- preview mode
- device mode: mobile/tablet/desktop

## 11. Preview Modes

Preview should support:
- mobile
- tablet
- desktop

Public menu is mobile-first, but dashboard should preview all.

## 12. Builder Validation

Before publishing:
- home page exists
- required fields exist
- broken media URLs detected
- unavailable locked components detected
- unsupported plugin sections detected
- menu has categories/products if needed

## 13. Custom Components

Custom components are reusable blocks.

Examples:
- Countdown offer
- Instagram gallery
- Chef recommendation
- Loyalty banner
- Reservation CTA

Custom components should be plugin-driven.

## 14. Public Rendering

Public site fetches published menu structure and renders sections dynamically.

Do not let public site render draft sections.

## 15. Important Rule for Codex

Build the Menu Builder in stages:
1. static page sections
2. reorder sections
3. section settings
4. draft/publish
5. version history
6. plugin sections
7. advanced preview
