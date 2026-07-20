# Multi-Branch, QR Codes, Domains and White Label

## 1. Multi-Branch

A restaurant may have multiple branches.

Each branch can have:
- name
- slug
- address
- phone
- WhatsApp number
- opening hours
- location map
- menu override
- availability override

## 2. Branch Inheritance

Branch can inherit:
- restaurant theme
- restaurant logo
- global products
- global menu

Branch can override:
- WhatsApp number
- opening hours
- location
- menu visibility
- product availability

## 3. Branch Public Routes

Examples:

```txt
/m/pizza-palace
/m/pizza-palace/branch/city-center
/m/pizza-palace/branch/mall
```

## 4. QR Codes

Generate QR codes for:
- restaurant main menu
- each branch menu
- specific page
- special offers page

Dashboard should allow:
- download PNG
- download SVG
- print-ready version
- copy link

## 5. QR Analytics

Track:
- QR scan/open event
- branch
- device
- time
- campaign if used

## 6. Custom Domains

Premium feature.

Allow restaurant to connect:
```txt
menu.restaurant.com
www.restaurant.com
```

Domain flow:
1. Restaurant enters domain.
2. System generates verification token.
3. Restaurant configures DNS.
4. System verifies DNS.
5. Domain becomes active.
6. Public menu is served from custom domain.

## 7. Domain Security

Need:
- HTTPS
- certificate management
- domain verification
- prevent domain hijacking
- one domain cannot belong to two restaurants

## 8. White Label

Premium feature.

White label means:
- remove platform logo
- remove "powered by"
- custom favicon
- custom domain
- custom metadata
- optionally custom email sender later

## 9. Brand Settings

White label settings:
- brand name
- logo
- favicon
- primary domain
- footer visibility
- platform badge enabled/disabled

## 10. Subscription Rules

Feature keys:
- `MULTI_BRANCH`
- `QR_CODES`
- `CUSTOM_DOMAIN`
- `WHITE_LABEL`

Backend must enforce all of them.
