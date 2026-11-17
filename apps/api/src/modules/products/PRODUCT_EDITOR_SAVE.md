# Unified product editor persistence (Task 2)

GET /dashboard/products/:id/editor returns one aggregate: id, server currency,
editVersion, configurationVersion, primaryImageId, product fields, V2 configuration,
dependencies and current advanced media. Reads use Repeatable Read.

PUT /dashboard/products/:id/editor accepts SaveProductEditor from @menu/shared:

    {
      "create": true,
      "expectedProductVersion": 0,
      "expectedConfigurationVersion": 0,
      "product": {
        "name": "Example", "description": "", "categoryId": null, "basePrice": "10",
        "isNew": false, "isFeatured": false, "isPopular": false,
        "moodKeys": [], "images": [], "ingredients": [], "mealDetails": []
      }
    }

Allocate the creation ID once with crypto.randomUUID() and reuse it on retry.
Existing identities cannot be reused by a create request. Resolve an uncertain outcome
with GET and compare the owned fields and expected resulting versions; never invent
another ID or automatically overwrite a newer version.

Configuration is optional: omission preserves it. When supplied it must have
schemaVersion 2, the route product ID and revision = expectedConfigurationVersion + 1.
A structurally unchanged configuration does not advance its revision. Base price must
agree numerically with the configuration Base. Configuration removal/conversion is not
implemented. Currency, availability, activation, orderability and source snapshots are
not accepted as client-owned product fields.

All product, configuration, dependency, image and selection writes share one
Serializable transaction, with up to three attempts for Prisma P2034 and version checks
on every attempt. Nested configuration persistence takes a TransactionClient and never
opens another transaction. A failed final relation write rolls everything back.

Image IDs are retained for matching owned image URLs or explicit owned IDs; first image
determines primaryImageId. Only removed relationships are deleted. Storage uploads
precede the save and storage objects are never deleted by the transaction. Upload failure
retains the draft and blocks submission until resolved.

Library identities are global, active library entries under the existing library policy.
Names/icons/type are resolved on the server; per-product detail values are not written
to the global definition. VALUE requires a nonempty value; PRESENCE stores an empty
value. Local descriptive entries remain supported for ordinary products, with media
validation. Duplicate library IDs within a selection list are rejected.

Historical PATCH product metadata, PATCH price and POST media-attachment endpoints now
require expectedProductVersion. Metadata PATCH delegates to the aggregate writer.
Quick price and media writers use guarded increments, preventing stale editor saves.
Import is create-only (not an update/upsert) and starts the new row at version 1.
Availability and sorting do not overwrite editor-owned data; advanced media changes are
explicit and retain the existing SUPER_ADMIN restriction in the product editor.

## Migration and reproducible tests

The migration adds editVersion/valueType and replaces the obsolete V1-only
configuration discriminator with V2. It aborts before changes if unexpected non-V2
Network rows exist; it never converts them. Existing ordinary rows are not rewritten.
Do not apply it to a real database as part of testing.

After dependency installation, Prisma generate and shared build:

    python apps/api/prisma/test-unified-product-editor.py --postgres-bin <PostgreSQL-bin-directory>

The runner initializes its own randomly ported loopback cluster, verifies its database
name/port/data-directory identity, migrates an ordinary populated baseline, compares
existing rows, tests rejection of unsupported V1 data in a separate clone and runs real
JWT/tenant-protected HTTP and PostgreSQL tests. It stops only its own cluster in finally.
No existing database is selected. Logs are under dist/qa-unified-editor/run/.

The React controller, reducer and hook are reusable for the V62 UI. The existing
ordinary editor uses one PUT and retains drafts/conflicts/upload failures. No interim
tree editor is added. The old independent Network save surface has been removed from
ProductForm. integration-boundary.ts remains unchanged: this task does not activate
public Network V2, cart/quote/checkout or claim Network end-to-end readiness.
