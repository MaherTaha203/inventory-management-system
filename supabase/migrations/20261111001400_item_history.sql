-- Item history is split by operation kind; it never calculates balances.

begin;

create or replace function public.get_item_history(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_stocktakes jsonb;
  v_receipts jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_id', l.id,
        'operation_id', o.id,
        'operation_number', o.operation_number,
        'operation_date', o.operation_date,
        'quantity', l.quantity,
        'unit_name', l.unit_name_snapshot
      )
      order by o.operation_date desc, o.operation_year desc, o.operation_sequence desc
    ),
    '[]'::jsonb
  )
  into v_stocktakes
  from public.stocktake_lines l
  join public.stocktake_operations o on o.id = l.operation_id
  where l.item_id = p_item_id
    and o.deleted_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_id', l.id,
        'operation_id', o.id,
        'receipt_number', o.receipt_number,
        'receipt_date', o.receipt_date,
        'quantity', l.quantity,
        'unit_name', l.unit_name_snapshot,
        'supplier_name', o.supplier_name_snapshot
      )
      order by o.receipt_date desc, o.receipt_number desc
    ),
    '[]'::jsonb
  )
  into v_receipts
  from public.receipt_lines l
  join public.receipt_operations o on o.id = l.operation_id
  where l.item_id = p_item_id
    and o.deleted_at is null;

  return jsonb_build_object(
    'stocktakes', v_stocktakes,
    'receipts', v_receipts
  );
end;
$function$;

revoke all on function public.get_item_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_item_history(uuid) to service_role;

commit;
