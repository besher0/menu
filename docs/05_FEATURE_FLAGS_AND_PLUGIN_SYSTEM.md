# Feature Flags and Plugin System

## 1. Why Feature Flags Are Required

The platform has many features that are subscription-dependent:
- 3D
- VR
- PWA
- analytics
- custom themes
- custom domains
- white label
- multi-branch
- advanced icons
- custom pages
- AI
- plugins

If these are implemented with random checks in many files, the codebase becomes hard to maintain.

## 2. Feature Flag Service

Create a centralized service.

```ts
class FeatureFlagService {
  canUseFeature(restaurantId: string, key: FeatureKey): Promise<boolean>
  getFeatureLimit(restaurantId: string, key: FeatureKey): Promise<number | null>
  assertFeature(restaurantId: string, key: FeatureKey): Promise<void>
}
```

## 3. Backend Usage

Example:

```ts
await featureFlagService.assertFeature(restaurantId, "PRODUCT_3D_VIEWER")
```

If not allowed:
- return 403
- include upgrade reason
- do not process request

## 4. Frontend Usage

Create hook:

```ts
const { canUse, limit } = useFeature("PRODUCT_3D_VIEWER")
```

The UI can show:
- enabled component
- locked card
- upgrade call-to-action

## 5. Caching

Feature checks happen often.

Use:
- memory cache short-term
- Redis later
- invalidate cache when subscription changes

## 6. Plugin System

Plugins should be optional feature modules.

Each plugin can declare:
- key
- name
- required feature flag
- dashboard components
- public components
- backend routes
- database dependencies
- permissions
- configuration schema

## 7. Plugin Examples

### WhatsApp Ordering Plugin

Feature:
`WHATSAPP_ORDERING`

Provides:
- cart send button
- message formatter
- order tracking
- WhatsApp redirect

### 3D Viewer Plugin

Feature:
`PRODUCT_3D_VIEWER`

Provides:
- 3D media upload
- public product 3D viewer
- model validation

### VR Viewer Plugin

Feature:
`PRODUCT_VR_VIEWER`

Provides:
- 360 panorama upload
- public VR viewer

### Analytics Plugin

Feature:
`ANALYTICS_BASIC` or `ANALYTICS_ADVANCED`

Provides:
- event tracking
- dashboard charts
- conversion metrics

### SEO Plugin

Feature:
`SEO_ADVANCED`

Provides:
- meta editor
- sitemap
- schema
- Open Graph settings

## 8. Plugin Registry

Create a registry:

```ts
const plugins = [
  whatsappPlugin,
  pwaPlugin,
  analyticsPlugin,
  threeDPlugin,
  vrPlugin,
  seoPlugin,
  qrPlugin
]
```

## 9. Plugin-based Rendering

Menu Builder sections may depend on plugins.

Example:
A `VR_GALLERY` section should only render if:
- plugin is installed
- restaurant subscription allows VR
- section is active
- media exists

## 10. Future Plugin Marketplace

Later, external/internal plugins could be sold:
- special templates
- AI description generator
- loyalty system
- reservation system
- review system
- delivery integrations

## 11. Important Rule

The core system must not depend on every plugin.

Plugins depend on core, not the other way around.
