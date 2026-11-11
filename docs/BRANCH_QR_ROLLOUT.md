# Multi-branch QR rollout (opt-in, legacy-safe)

## Non-negotiable compatibility contract

- Do **not** alter the ID, generated SVG, tracked URL (`/q/:id`), or saved `targetUrl` of any existing QR code.
- Do **not** redirect existing restaurant root links to branch selection.
- Legacy URLs containing `?branch=<slug>` stay on the legacy menu path; the new feature only reads `selectedBranch`.
- The existing `QrPublicController` and `QrService.trackAndResolve` are unchanged.
- The new flow introduces **new** QR code rows; it never edits an existing row automatically.
- No Prisma schema or database migration is needed for this change.

## New customer journey

1. Manager visits **Dashboard > QR** and selects **QR رئيسي لاختيار الفروع**.
2. This creates/reuses a dedicated new QR pointing to `https://<restaurant>.<ROOT_DOMAIN>/branches`.
3. Scanning opens a lightweight branch selector. If there is a single active branch, the browser proceeds to its menu.
4. Selecting a branch opens the normal menu with `?selectedBranch=<stable-branch-id>`.
5. The query value is retained on internal menu/product/cart links; the cart uses a separate key for each branch.
6. The WhatsApp order passes `branchSlug` to the existing order API; the API verifies the branch and picks its WhatsApp contact.
7. A manager can also create/reuse a **new** QR for a particular branch, which opens its menu immediately.
8. If a branch is deleted/disabled, the new query redirects to the selector instead of sending an order to a different branch.

## API additions

- `GET /public/menus/:restaurantSlug/branches`: lightweight public discovery (restaurant name/logo plus active branches only).
- `POST /dashboard/qr/branch-selector`: create/reuse opt-in selector QR (requires `QR_CODES` permission).
- `POST /dashboard/qr/branch-entry/:branchId`: create/reuse a new direct-branch QR for an active, owned branch.
- `GET /dashboard/qr` now includes `scanCount` from recorded `QR_OPENED` events. The old fake counter was removed.

The existing `GET /q/:id` behavior remains exactly as before: log the event and redirect to the recorded target URL.

## Suggested pre-release checks

Run from repository root after installing dependencies and generating Prisma Client:

```bash
npm ci
npm run prisma:generate -w @menu/api
npm run test -w @menu/api
npm run typecheck -w @menu/api
npm run typecheck -w @menu/web
npm run build -w @menu/web
```

Manually on a staging deployment:

- Scan an existing restaurant QR printed before this release: it must open the **same** destination and experience.
- Scan an existing branch QR that contains `?branch=`: its target and behavior must remain unchanged.
- Visit the restaurant root normally, without `selectedBranch`: no automatic branch selector must appear.
- Generate the new selector twice: it must return the same code and URL.
- Generate a new direct-branch QR twice: it must return the same code and URL.
- Open selector with zero, one and multiple active branches.
- Select branch A, add items, then select branch B: no items from A should appear in B's cart.
- Navigate home/menu/product/cart and back: `selectedBranch` must remain present.
- Submit a WhatsApp order from branch B: verify the order's `branchId` and the destination number.
- Disable branch B: scanning its new QR must lead to selection, never silently fall back to another branch.
- Verify each QR scan is counted under its own ID; the dashboard number is based on events.
- Inspect existing QR records before and after staging test and confirm old IDs/targets are identical.

## Deployment

Keep the pull request as a **draft** until type checks, tests, and manual QR comparisons succeed. Do not merge or deploy from the development branch by default. The new selector is opt-in: existing restaurants do not need to print anything or change settings.

## Scope limitation

Products, categories, base prices and availability are still configured at the **restaurant** level; this change only adds branch selection, navigation context, branch-specific cart and WhatsApp routing. Per-branch product overrides would require a separate data model and later release.
