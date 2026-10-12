# Products, Media, 3D and VR

## 1. Product System

Products are not simple rows.

They need:
- categories
- images
- price
- description
- options
- extras
- availability
- translations
- media
- 3D
- VR
- SEO fields
- analytics tracking

## 2. Product Options

A product can have option groups.

Example: Pizza

Size:
- Small: +0
- Medium: +3
- Large: +6

Extras:
- Cheese: +1
- Mushrooms: +1.5
- Sauce: +0.5

Rules:
- required or optional
- single or multiple choice
- min/max selection
- price delta

## 3. Product Availability

Each product can be:
- active/inactive
- available/unavailable
- available by schedule
- available by branch
- sold out

Dashboard should allow quick toggle.

## 4. Product Media Types

Every product can have all media types at the same time:
- normal image gallery
- 3D model
- VR/360 panorama

Visibility depends on:
1. subscription feature
2. uploaded media
3. active media
4. public published status

## 5. 3D Media

Recommended formats:
- GLB
- GLTF

Frontend viewer:
- model-viewer for MVP
- Three.js for advanced custom viewer later

Feature key:
`PRODUCT_3D_VIEWER`

Dashboard:
- upload model
- preview model
- activate/deactivate
- show locked state if plan does not allow it

Public site:
- show 3D button only when allowed and available

## 6. VR / 360 Media

Recommended:
- equirectangular panorama images
- 360 product image viewer
- panorama viewer library

Feature key:
`PRODUCT_VR_VIEWER`

Public site:
- show VR/360 button only when allowed and available

## 7. Media Library

Instead of uploading the same image repeatedly:
- create central media library
- each file belongs to restaurant
- products/pages/sections reference media

Media fields:
- url
- type
- size
- width
- height
- alt text
- storage provider
- created by

## 8. Image Processing

For performance:
- compress images
- generate WebP/AVIF
- generate thumbnails
- lazy loading
- responsive sizes
- CDN URLs

## 9. Upload Pipeline

MVP:
- upload file to local or simple storage
- save media row
- attach to product

Production:
- upload to object storage
- background processing
- CDN delivery
- virus scan
- metadata extraction

## 10. Product Translations

Products should support multiple languages.

Translatable fields:
- name
- description
- option group names
- option names
- SEO title
- SEO description

## 11. Codex Rule

Do not model product media as a single `viewMode`.

Correct:
- ProductImage[]
- Product3DModel?
- ProductVrMedia?

Feature flags decide availability.
