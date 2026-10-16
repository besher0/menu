-- Stage 6F.3: synthetic, disposable PostgreSQL only. Never run on an existing database.
-- Baseline is generated from the Stage 0 Prisma schema, not a Production dump.
CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "Restaurant" ("id", "name", "slug", "currency", "whatsappPhone", "updatedAt") VALUES
  ('s6f3-r1', 'مطعم اصطناعي', 's6f3-r1', 'SYP', '0000000000', now()),
  ('s6f3-r2', 'Synthetic Restaurant', 's6f3-r2', 'USD', '0000000001', now());
INSERT INTO "Category" ("id", "restaurantId", "name", "slug") VALUES
  ('s6f3-c1', 's6f3-r1', 'بيتزا', 'pizza'),
  ('s6f3-c2', 's6f3-r2', 'Pizza', 'pizza');
INSERT INTO "Product" ("id", "restaurantId", "categoryId", "name", "slug", "basePrice", "currency", "updatedAt") VALUES
  ('s6f3-legacy', 's6f3-r1', 's6f3-c1', 'Legacy Pizza', 'legacy', 12500.00, 'SYP', now()),
  ('s6f3-source', 's6f3-r1', 's6f3-c1', 'Linked Source', 'source', 1000.00, 'SYP', now()),
  ('s6f3-other', 's6f3-r2', 's6f3-c2', 'Other Tenant', 'other', 10.00, 'USD', now());
INSERT INTO "ProductOptionGroup" ("id", "productId", "name", "type", "required") VALUES
  ('s6f3-group', 's6f3-legacy', 'Extra', 'MULTIPLE', false);
INSERT INTO "ProductOption" ("id", "groupId", "name", "priceDelta") VALUES
  ('s6f3-option', 's6f3-group', 'Cheese', 500.00);
INSERT INTO "Order" ("id", "restaurantId", "customerName", "totalAmount", "currency", "status", "source", "whatsappMessage") VALUES
  ('s6f3-order', 's6f3-r1', 'Synthetic Customer', 13000.00, 'SYP', 'PENDING_WHATSAPP', 'WHATSAPP', 'Synthetic only');
INSERT INTO "OrderItem" ("id", "orderId", "productId", "name", "quantity", "unitPrice", "totalPrice", "options") VALUES
  ('s6f3-item', 's6f3-order', 's6f3-legacy', 'Legacy Pizza', 1, 13000.00, 13000.00, '[{"id":"s6f3-option"}]'::jsonb);
INSERT INTO "AnalyticsEvent" ("id", "restaurantId", "type") VALUES
  ('s6f3-analytics', 's6f3-r1', 'WHATSAPP_ORDER_CLICKED');
