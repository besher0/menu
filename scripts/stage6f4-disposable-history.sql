-- Synthetic migration metadata for the NEW Stage 6F.4 disposable baseline only.
-- These rows are NOT copied from Production and MUST NEVER be used to reconcile it.
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES
  ('s6f4-history-1', 'A5BBCB330F71578EE49750E0C15D79DD6088500C1248359EEC432BC6713FBC1B', now(), '20260719000000_add_category_visual_settings', 1),
  ('s6f4-history-2', '4A085CEE7B45F7E46F9BC9F24E903D1F7BBE46EC412BEEE9DD2654B7A3C61EE1', now(), '20260721000000_add_product_mood_key', 1),
  ('s6f4-history-3', 'A27E49CB39595C5D98CB6EEAF4E2D79D6A0AD921A665598E78B5BEEBBA2F4565', now(), '20260721001000_add_category_icon_dimensions', 1),
  ('s6f4-history-4', '579D7AEB52CFF91C99756482BD44AB1749B099EF8C15624D3FBE146F74BA18D9', now(), '20260807000000_add_product_libraries', 1),
  ('s6f4-history-5', '4544E53CE71008FE157B97B4D1D7883E0C532BAAD7C40CDDE2B4514FCC15C92C', now(), '20260815000000_global_product_libraries', 1);
