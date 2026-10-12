# Business Model and Subscriptions

## 1. SaaS Business Model

The platform should use subscription plans. Each restaurant pays for access to a set of features.

The subscription model must be flexible because features may change over time.

The database should not depend on fixed plan names only. Plans should be configurable.

## 2. Suggested Plans

### Basic Plan

Target:
Small restaurants that need a simple digital menu and WhatsApp ordering.

Includes:
- restaurant profile
- one menu
- basic categories
- products
- image gallery
- cart
- WhatsApp ordering
- basic QR code
- basic theme preset
- public menu link

Excludes:
- advanced PWA
- 3D
- VR
- custom domain
- white label
- advanced analytics
- advanced components

### Pro Plan

Target:
Restaurants that want a better digital experience.

Includes everything in Basic plus:
- advanced theme builder
- PWA menu caching
- more templates
- custom icons
- 3D product viewer
- advanced product options
- basic analytics
- multiple menu pages
- branch support depending on limits

### Premium Plan

Target:
Professional restaurants and chains.

Includes everything in Pro plus:
- VR/360 product viewer
- white label
- custom domain
- advanced analytics
- advanced SEO
- more branches
- advanced custom components
- priority support
- plugin access

## 3. Feature Keys

Use feature keys to control access.

Recommended feature keys:

```ts
PRODUCT_IMAGES
PRODUCT_3D_VIEWER
PRODUCT_VR_VIEWER
CART_ORDERING
WHATSAPP_ORDERING
PWA_MENU
OFFLINE_MENU_CACHE
CUSTOM_THEMES
ADVANCED_THEMES
CUSTOM_PAGES
CUSTOM_COMPONENTS
ADVANCED_ICONS
MULTI_BRANCH
QR_CODES
CUSTOM_DOMAIN
WHITE_LABEL
ANALYTICS_BASIC
ANALYTICS_ADVANCED
SEO_BASIC
SEO_ADVANCED
MENU_VERSIONING
DRAFT_PUBLISH
PLUGIN_MARKETPLACE
AI_TOOLS
```

## 4. Feature Limits

Some features are boolean, but others need limits.

Examples:
- max branches
- max products
- max media storage
- max menus
- max pages
- max custom domains
- max monthly views
- max analytics retention days

Feature example:

```json
{
  "key": "MAX_BRANCHES",
  "type": "LIMIT",
  "value": 3
}
```

## 5. Subscription Evaluation

The backend should expose a reusable service:

```ts
canUseFeature(restaurantId: string, featureKey: string): Promise<boolean>
getFeatureLimit(restaurantId: string, featureKey: string): Promise<number | null>
```

Do not duplicate plan logic in controllers.

## 6. Frontend Locked States

The dashboard must show unavailable features as locked instead of hiding everything.

Example:
- 3D upload card appears with a lock badge.
- Button says "Upgrade to Pro".
- Tooltip explains why it is locked.

This helps sales.

## 7. Backend Enforcement

Frontend locks are not enough.

The backend must also enforce:
- cannot upload 3D media without `PRODUCT_3D_VIEWER`
- cannot activate VR without `PRODUCT_VR_VIEWER`
- cannot add custom domain without `CUSTOM_DOMAIN`
- cannot remove branding without `WHITE_LABEL`

## 8. Trial and Grace Period

Recommended future features:
- free trial
- grace period after subscription expiry
- read-only mode
- downgrade behavior

If a restaurant downgrades:
- existing 3D/VR media should not be deleted
- features should become inactive
- public menu should hide locked media
- dashboard should show upgrade prompts

## 9. Why This Matters

Subscription logic becomes very messy if implemented with random if-statements.

The correct approach:
- SubscriptionPlan
- SubscriptionFeature
- RestaurantSubscription
- FeatureFlagService
- Backend guards
- Frontend hooks
