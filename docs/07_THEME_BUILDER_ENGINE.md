# Theme Builder Engine

## 1. Goal

The Theme Builder allows restaurants to change the visual identity of their public menu without code.

It must be more than color editing.

## 2. Theme Settings

Theme settings should include:

Colors:
- primary
- secondary
- background
- surface
- text
- muted text
- border
- success
- warning
- error

Typography:
- font family
- heading font
- base font size
- heading scale
- letter spacing

Shape:
- border radius
- card radius
- button radius

Spacing:
- section padding
- card padding
- grid gap

Components:
- button style
- card style
- header style
- footer style
- category style
- product card style

Effects:
- shadows
- transitions
- animations

Modes:
- light
- dark
- automatic

Direction:
- RTL
- LTR

## 3. Store Theme as JSON

Example:

```json
{
  "colors": {
    "primary": "#111827",
    "secondary": "#f59e0b",
    "background": "#ffffff",
    "surface": "#f8fafc",
    "text": "#111827"
  },
  "typography": {
    "fontFamily": "Inter",
    "headingFontFamily": "Poppins"
  },
  "radius": {
    "button": "12px",
    "card": "18px"
  },
  "layout": {
    "productCard": "modern",
    "categoryGrid": "rounded"
  }
}
```

## 4. CSS Variables

Convert theme JSON to CSS variables.

Example:

```css
:root {
  --color-primary: #111827;
  --color-secondary: #f59e0b;
  --radius-card: 18px;
}
```

## 5. Theme Presets

Provide starter themes:
- Modern Café
- Dark Luxury
- Fast Food
- Dessert Shop
- Minimal
- Traditional Arabic
- Premium Restaurant

## 6. Theme Inheritance

A restaurant can:
- choose system theme
- override specific tokens
- reset to default

## 7. Branch Theme Override

Optional:
A branch may inherit restaurant theme or override selected settings.

Example:
Main restaurant brand remains the same, but a branch has different header image.

## 8. Validation

Theme JSON must be validated.

Do not allow:
- invalid colors
- unsafe CSS
- huge custom CSS
- broken font URLs

## 9. Custom CSS

Custom CSS should be Premium-only.

If allowed:
- limit scope
- sanitize
- warn about advanced use
- keep public site safe

## 10. Dark Mode

Support:
- forced light
- forced dark
- system preference

## 11. RTL/LTR

Arabic menus need RTL.
English/German/Turkish menus need LTR.

Theme engine must support both.

## 12. Frontend Implementation

Create:
- ThemeProvider
- ThemePreview
- ThemeEditor
- CSS variable generator
- preset selector

## 13. Codex Rule

Do not hardcode theme values inside components.

All public components must use tokens/CSS variables.
