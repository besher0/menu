# Product Owner Decisions — Deferred and Rejected Features

Decision date: 2026-11-15. These decisions apply to production application source.
Any new owner-approved deferral must be recorded here; reopening requires explicit Product Owner approval. Preserve the existing implementation unless this record specifically excludes its UI from the current transfer.

| ID | Feature / scope | Decision and context | Status | Existing behavior to preserve | Reopening |
|---|---|---|---|---|---|
| D-001 | V62 product-table availability and operational controls | Omit these columns/controls from the transferred table; no empty columns | DEFERRED — NOT IMPLEMENTED in the transferred table | Backend availability and every other existing availability surface | Owner approval |
| D-002 | Future translation UI / workflow | Do not transfer the V62 translation system | DEFERRED — NOT IMPLEMENTED | Existing supported languages | Owner approval |
| D-003 | Future Service Mode settings | Do not transfer these settings | DEFERRED — NOT IMPLEMENTED | Current Delivery/Pickup and service logic | Owner approval |
| D-004 | Future Business Catalog Import | Do not transfer this new import system under the existing import label | DEFERRED — NOT IMPLEMENTED | Existing Excel import/export, validation, roles, APIs and file format | Owner approval |
| D-005 | Future V62 sidebar / administrative structure | Keep the current Legacy role-based sidebar | DEFERRED — NOT IMPLEMENTED | Current admin/owner navigation; Categories hidden entirely from owner by latest explicit decision | Owner approval |
| D-006 | Calories, including sizes/add-ons/linked totals | Do not transfer the prototype calorie engine or fields | DEFERRED — NOT IMPLEMENTED | Existing data and pricing | Owner approval |
| D-007 | Allergens and their new library | Do not transfer this feature | DEFERRED — NOT IMPLEMENTED | Existing media/library data | Owner approval |
| D-008 | Advanced scheduling, including sizes | Do not transfer scheduling UI or engine | DEFERRED — NOT IMPLEMENTED | Current availability and operational rules | Owner approval |
| D-009 | OrderSawa Image Infrastructure — automatic AVIF/WebP media processing and universal upload pipeline | Future standalone media pipeline: accept one original/master image, generate appropriately sized responsive derivatives (AVIF where appropriate, WebP fallback), version image URLs for reliable cache invalidation, and integrate Dashboard upload states (Uploading / Processing / Ready / Failed) with Public Menu delivery. Do not expose codec/compression controls to merchants. Exact derivatives, costs, storage and rollout need a separate technical decision. This is not the current image-flash/React rendering fix. | DEFERRED — NOT IMPLEMENTED as a unified upload pipeline | Current upload/gallery and image references, working Next.js WebP optimization and HTTP caching, correct image replacements/deletions, and current public-menu performance; no migration or conversion of existing originals now | Explicit Product Owner approval for the future image-infrastructure phase, after separate architecture/cost/performance review |
| D-010 | Product thumbnail loading schedule | Consider prioritizing all visible cards, a bounded next one or two screens, then further images according to scroll, resources and network speed. Avoid bulk loading on slow connections. | DEFERRED | Existing image delivery and retention C + progressive B | Owner approval |
| D-011 | Selective large product image preloading | C1/C2/C3 prepare one, two or three large derivatives, D prepares near interaction, E adapts to connection conditions. | DEFERRED | B keeps the ready card thumbnail during a user-initiated open | Owner approval |

## Active features — not deferred

- Existing Import: **ACTIVE — PRESERVED**. Current label: **استيراد من Excel**. Existing admin-only modal and API are retained.
- Existing Export: **ACTIVE — PRESERVED**. Current label: **تصدير**. Existing admin-only download/API and XLSX structure are retained.
- Product Configuration draft preview: **APPROVED** on 2026-11-15. Reuses customer configuration components, reads the current draft, and has no Cart/Order/Checkout/WhatsApp/auto-save actions.

## Rejected features — not merely deferred

| ID | Feature | Decision | Preserved boundary |
|---|---|---|---|
| R-001 | Standalone Meal Information Preview | REJECTED — NOT IMPLEMENTED | Do not introduce the previously rejected separate meal-information screen |
| R-002 | Extra Price/Cart Simulator | REJECTED — NOT IMPLEMENTED | The approved visual draft Configurator is not a cart or commercial simulator; final pricing remains the server's Trusted Quote |

This registry does not reopen Demo-only infrastructure decisions or supersede other saved architectural decisions.

## Approved public sidebar / feedback — 2026-11-15

- APPROVED — Public Questions navigation removed; no historical data/API deletion.
- APPROVED — Optional About us reuses restaurant description, first branch address and explicit WGS84 coordinates; no address inference.
- APPROVED — One Ratings/Complaints form. Stars required, comment required for 1–3 and optional for 4–5. No default rating.
- APPROVED — Restaurant chooses DASHBOARD (default) or WHATSAPP. Dashboard feedback permits anonymous submission and optional name/phone. Contacts are private to authorized OWNER/admin inbox access. WhatsApp only opens a prepared message, with no server send or receipt/storage claim.
- The public logo/social/language/hours behavior and all prior deferred/rejected features remain preserved. This does not transfer the future administrative sidebar.

## Approved checkout / public drawer refinement — 2026-11-16

- About now uses a validated HTTPS Google Maps share URL stored in existing dashboard settings JSON. Existing branch coordinates remain intact for other consumers; no coordinate fallback in About.
- Hours/About/Feedback are exclusive, collapsible in-drawer sections; changing sections preserves the feedback draft. AR/EN uses the existing persisted menu language.
- Anonymous Dashboard feedback: three successful submissions per visitor and restaurant in a rolling 12-hour window; 20 attempts per IP/restaurant in ten minutes. Shared PostgreSQL enforcement, no raw identifiers stored. Clearing browser storage can create a new visitor; the separate IP safety limit remains.
- WhatsApp link opening is not a sent-message receipt. Financial confirmations in acceptance tests are synthetic and isolated.
