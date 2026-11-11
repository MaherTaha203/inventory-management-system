-- Explicit empty-trash routine. Number counters are intentionally preserved.

begin;

create or replace function public.empty_trash()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_stocktakes integer;
  v_receipts integer;
  v_items integer;
  v_suppliers integer;
begin
  delete from public.stocktake_operations
    where deleted_at is not null;
  get diagnostics v_stocktakes = row_count;

  delete from public.receipt_operations
    where deleted_at is not null;
  get diagnostics v_receipts = row_count;

  delete from public.catalog_items
    where deleted_at is not null;
  get diagnostics v_items = row_count;

  delete from public.suppliers
    where deleted_at is not null;
  get diagnostics v_suppliers = row_count;

  return jsonb_build_object(
    'stocktakes', v_stocktakes,
    'receipts', v_receipts,
    'items', v_items,
    'suppliers', v_suppliers
  );
end;
$function$;

revoke all on function public.empty_trash() from public, anon, authenticated, service_role;
grant execute on function public.empty_trash() to service_role;

commit;
