# Database and Prisma Design

## 1. Database Design Goals

The database must support:
- multi-tenancy
- subscriptions
- feature flags
- restaurants
- branches
- users and permissions
- menus
- pages
- builder sections
- themes
- products
- product images
- 3D media
- VR media
- cart/order tracking
- WhatsApp clicks
- analytics
- QR codes
- SEO
- custom domains
- white label
- notifications
- audit logs

## 2. Core Models

Recommended Prisma models:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  role         GlobalRole @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships RestaurantMember[]
}

enum GlobalRole {
  SUPER_ADMIN
  USER
}
```

## 3. Restaurant

```prisma
model Restaurant {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  description     String?
  logoUrl         String?
  defaultLanguage String   @default("ar")
  isActive        Boolean  @default(true)
  platformBranding Boolean @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  branches        Branch[]
  members         RestaurantMember[]
  menus           Menu[]
  products        Product[]
  categories      Category[]
  themeSettings   RestaurantThemeSettings?
  subscription    RestaurantSubscription?
  domains         CustomDomain[]
}
```

## 4. Branches

```prisma
model Branch {
  id            String   @id @default(cuid())
  restaurantId  String
  name          String
  slug          String
  address       String?
  city          String?
  country       String?
  whatsappPhone String?
  latitude      Float?
  longitude     Float?
  isActive      Boolean @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  openingHours BranchOpeningHour[]
  menus Menu[]

  @@unique([restaurantId, slug])
  @@index([restaurantId])
}
```

## 5. Restaurant Members and Permissions

```prisma
model RestaurantMember {
  id           String @id @default(cuid())
  restaurantId String
  userId       String
  role         RestaurantRole
  createdAt    DateTime @default(now())

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  user       User       @relation(fields: [userId], references: [id])

  @@unique([restaurantId, userId])
}
```

```prisma
enum RestaurantRole {
  OWNER
  MANAGER
  EDITOR
  EMPLOYEE
}
```

## 6. Menus and Pages

```prisma
model Menu {
  id           String @id @default(cuid())
  restaurantId String
  branchId     String?
  name         String
  slug         String
  status       PublishStatus @default(DRAFT)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  branch     Branch?    @relation(fields: [branchId], references: [id])
  pages      MenuPage[]

  @@index([restaurantId])
  @@index([branchId])
}
```

```prisma
model MenuPage {
  id        String @id @default(cuid())
  menuId    String
  title     String
  slug      String
  sortOrder Int @default(0)
  isHome    Boolean @default(false)
  status    PublishStatus @default(DRAFT)
  seoTitle  String?
  seoDescription String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  menu Menu @relation(fields: [menuId], references: [id])
  sections MenuSection[]

  @@unique([menuId, slug])
}
```

## 7. Builder Sections

```prisma
model MenuSection {
  id        String @id @default(cuid())
  pageId    String
  type      String
  sortOrder Int @default(0)
  settings  Json
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  page MenuPage @relation(fields: [pageId], references: [id])
}
```

Examples of section types:
- HERO
- CATEGORY_GRID
- FEATURED_PRODUCTS
- PRODUCT_LIST
- GALLERY
- ABOUT
- REVIEWS
- CONTACT
- MAP
- OPENING_HOURS
- OFFERS
- QR_CODE
- SOCIAL_LINKS
- CUSTOM_COMPONENT

## 8. Products and Categories

```prisma
model Category {
  id           String @id @default(cuid())
  restaurantId String
  name         String
  slug         String
  description  String?
  imageUrl     String?
  sortOrder    Int @default(0)
  isActive     Boolean @default(true)
  deletedAt    DateTime?

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  products Product[]

  @@unique([restaurantId, slug])
  @@index([restaurantId])
}
```

```prisma
model Product {
  id           String @id @default(cuid())
  restaurantId String
  categoryId   String?
  name         String
  slug         String
  description  String?
  basePrice    Decimal
  currency     String @default("EUR")
  isActive     Boolean @default(true)
  isAvailable  Boolean @default(true)
  isFeatured   Boolean @default(false)
  sortOrder    Int @default(0)
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  category   Category?  @relation(fields: [categoryId], references: [id])
  images     ProductImage[]
  options    ProductOptionGroup[]
  media3d    Product3DModel?
  vrMedia    ProductVrMedia?

  @@unique([restaurantId, slug])
  @@index([restaurantId])
  @@index([categoryId])
}
```

## 9. Product Options

Use option groups for variants and extras.

Examples:
- Size: Small, Medium, Large
- Extras: Cheese, Sauce, Mushrooms
- Required selection
- Multiple selection
- Min/max selections

```prisma
model ProductOptionGroup {
  id        String @id @default(cuid())
  productId String
  name      String
  type      OptionGroupType
  required  Boolean @default(false)
  minSelect Int?
  maxSelect Int?
  sortOrder Int @default(0)

  product Product @relation(fields: [productId], references: [id])
  options ProductOption[]
}
```

```prisma
model ProductOption {
  id        String @id @default(cuid())
  groupId   String
  name      String
  priceDelta Decimal @default(0)
  isActive  Boolean @default(true)
  sortOrder Int @default(0)

  group ProductOptionGroup @relation(fields: [groupId], references: [id])
}
```

## 10. Product Media

Do not use one `viewMode`.

Products can have all media types:
- normal images
- 3D
- VR/360

Access is controlled by feature flags.

```prisma
model ProductImage {
  id        String @id @default(cuid())
  productId String
  url       String
  altText   String?
  sortOrder Int @default(0)
  isActive  Boolean @default(true)

  product Product @relation(fields: [productId], references: [id])
}
```

```prisma
model Product3DModel {
  id        String @id @default(cuid())
  productId String @unique
  url       String
  format    String
  isActive  Boolean @default(true)

  product Product @relation(fields: [productId], references: [id])
}
```

```prisma
model ProductVrMedia {
  id        String @id @default(cuid())
  productId String @unique
  panoramaUrl String
  type      String
  isActive  Boolean @default(true)

  product Product @relation(fields: [productId], references: [id])
}
```

## 11. Themes

```prisma
model Theme {
  id          String @id @default(cuid())
  name        String
  key         String @unique
  description String?
  defaultSettings Json
  isSystem    Boolean @default(false)
  createdAt   DateTime @default(now())
}
```

```prisma
model RestaurantThemeSettings {
  id           String @id @default(cuid())
  restaurantId String @unique
  themeId      String?
  settings     Json
  customCss    String?
  updatedAt    DateTime @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
}
```

## 12. Subscriptions and Features

```prisma
model SubscriptionPlan {
  id          String @id @default(cuid())
  name        String
  key         String @unique
  priceMonthly Decimal?
  priceYearly  Decimal?
  isActive    Boolean @default(true)

  features SubscriptionFeature[]
}
```

```prisma
model SubscriptionFeature {
  id       String @id @default(cuid())
  planId   String
  key      String
  enabled  Boolean @default(true)
  limit    Int?
  metadata Json?

  plan SubscriptionPlan @relation(fields: [planId], references: [id])

  @@unique([planId, key])
}
```

```prisma
model RestaurantSubscription {
  id           String @id @default(cuid())
  restaurantId String @unique
  planId       String
  status       SubscriptionStatus
  startsAt     DateTime
  endsAt       DateTime?
  trialEndsAt  DateTime?

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  plan SubscriptionPlan @relation(fields: [planId], references: [id])
}
```

## 13. Orders and WhatsApp

```prisma
model Order {
  id           String @id @default(cuid())
  restaurantId String
  branchId     String?
  customerName  String?
  customerPhone String?
  totalAmount   Decimal
  currency      String
  status        OrderStatus
  source        String @default("WHATSAPP")
  whatsappMessage String?
  createdAt DateTime @default(now())

  items OrderItem[]

  @@index([restaurantId])
  @@index([branchId])
}
```

## 14. Analytics

Use event table first.

```prisma
model AnalyticsEvent {
  id           String @id @default(cuid())
  restaurantId String
  branchId     String?
  type         String
  metadata     Json?
  path         String?
  userAgent    String?
  country      String?
  createdAt    DateTime @default(now())

  @@index([restaurantId, type])
  @@index([createdAt])
}
```

Later aggregate events into daily tables for performance.

## 15. Custom Domains

```prisma
model CustomDomain {
  id           String @id @default(cuid())
  restaurantId String
  domain       String @unique
  status       DomainStatus
  verificationToken String
  verifiedAt   DateTime?
  createdAt    DateTime @default(now())

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
}
```

## 16. Audit Logs

```prisma
model AuditLog {
  id           String @id @default(cuid())
  restaurantId String?
  userId       String?
  action       String
  entityType   String
  entityId     String?
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([restaurantId])
  @@index([userId])
}
```

## 17. Database Rules

- Use soft delete for important entities.
- Index every foreign key.
- Use unique slug per tenant.
- Store dynamic builder settings in JSON.
- Validate JSON with backend schemas.
- Do not expose internal IDs unnecessarily in public APIs.
