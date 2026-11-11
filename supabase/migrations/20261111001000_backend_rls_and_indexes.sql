-- Explicit backend-role RLS policies and indexes for unit foreign keys.
-- anon/authenticated retain no table grants; this policy does not expose rows to clients.

begin;

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'catalog_items',
    'suppliers',
    'measurement_units',
    'stocktake_counters',
    'stocktake_operations',
    'stocktake_lines',
    'receipt_number_counter',
    'receipt_operations',
    'receipt_lines',
    'app_settings',
    'device_sessions',
    'login_attempts',
    'login_throttle_state'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      v_table || '_service_role_access',
      v_table
    );
  end loop;
end;
$block$;

create policy item_name_history_service_role_read
  on public.item_name_history
  for select to service_role
  using (true);

create index stocktake_lines_unit_idx
  on public.stocktake_lines (unit_id);

create index receipt_lines_unit_idx
  on public.receipt_lines (unit_id);

commit;
