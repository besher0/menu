-- Intentionally fake completeness guard in disposable PG16 CI only.
BEGIN;
DO $atomic_fake_preflight$
DECLARE stage6c_count integer;
BEGIN
  SELECT count(*)::int INTO stage6c_count FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgrelid IN ('public."Order"'::regclass, 'public."OrderItem"'::regclass)
      AND t.tgname IN (
        'Order_network_snapshot_immutable', 'Order_network_snapshot_no_delete',
        'Order_network_snapshot_seal_required', 'OrderItem_network_snapshot_immutable',
        'OrderItem_network_snapshot_no_late_insert', 'OrderItem_network_snapshot_no_delete');
  IF current_database() <> 'ordersawa_stage3_stage6c_stage6d3c3f_fake_guard'
    OR current_user <> 'test' OR current_schema() <> 'public'
    OR current_setting('server_version_num')::int < 160000
    OR current_setting('server_version_num')::int >= 170000
    OR host(inet_server_addr()) <> '127.0.0.1' OR inet_server_port() <> 55440
    OR stage6c_count <> 6
    OR EXISTS (SELECT 1 FROM public."Order")
    OR EXISTS (SELECT 1 FROM public."OrderItem")
    OR EXISTS (SELECT 1 FROM public."Restaurant")
    OR to_regprocedure('public.require_complete_network_test_order()') IS NOT NULL
  THEN RAISE EXCEPTION 'Refusing nonempty or non-disposable fake Atomic CI guard';
  END IF;
END;
$atomic_fake_preflight$;
CREATE FUNCTION public.require_complete_network_test_order() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Order_network_test_completeness_guard"
  AFTER INSERT OR UPDATE OF "source" ON public."Order"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.require_complete_network_test_order();
COMMIT;
