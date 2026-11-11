-- Preserve historical catalog references when editing an existing operation.
-- Inactive units and soft-deleted catalog entries remain valid for existing records.

begin;

create or replace function public.save_stocktake(
  p_operation_id uuid,
  p_operation_date date,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation_id uuid;
  v_line jsonb;
  v_item_id uuid;
  v_unit_id uuid;
  v_quantity numeric;
  v_item_name text;
  v_unit_name text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'A stocktake must contain at least one line.';
  end if;

  if p_operation_id is null then
    insert into public.stocktake_operations (operation_date)
    values (p_operation_date)
    returning id into v_operation_id;
  else
    update public.stocktake_operations
      set operation_date = p_operation_date
      where id = p_operation_id and deleted_at is null
      returning id into v_operation_id;

    if v_operation_id is null then
      raise exception using errcode = 'P0002', message = 'Active stocktake was not found.';
    end if;

    delete from public.stocktake_lines where operation_id = v_operation_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_item_id := nullif(v_line ->> 'item_id', '')::uuid;
    v_unit_id := nullif(v_line ->> 'unit_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity', '')::numeric;

    if v_item_id is null or v_quantity is null then
      raise exception using errcode = '22023', message = 'Every stocktake line requires an item and quantity.';
    end if;

    if v_quantity < 0 or v_quantity <> trunc(v_quantity, 2) then
      raise exception using errcode = '22023', message = 'Stocktake quantity must be nonnegative with at most two decimal places.';
    end if;

    select name into v_item_name
      from public.catalog_items
      where id = v_item_id;

    if not found then
      raise exception using errcode = '23503', message = 'The selected item does not exist or is deleted.';
    end if;

    v_unit_name := null;
    if v_unit_id is not null then
      select name into v_unit_name
        from public.measurement_units
        where id = v_unit_id;

      if not found then
        raise exception using errcode = '23503', message = 'The selected measurement unit is not active.';
      end if;
    end if;

    insert into public.stocktake_lines (
      operation_id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot
    )
    values (
      v_operation_id, v_item_id, v_item_name, v_quantity, v_unit_id, v_unit_name
    );
  end loop;

  return v_operation_id;
end;
$function$;

revoke all on function public.save_stocktake(uuid, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stocktake(uuid, date, jsonb) to service_role;

create or replace function public.save_receipt(
  p_operation_id uuid,
  p_receipt_date date,
  p_supplier_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation_id uuid;
  v_supplier_name text;
  v_line jsonb;
  v_item_id uuid;
  v_unit_id uuid;
  v_quantity numeric;
  v_item_name text;
  v_unit_name text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'A receipt must contain at least one line.';
  end if;

  v_supplier_name := null;
  if p_supplier_id is not null then
    select name into v_supplier_name
      from public.suppliers
      where id = p_supplier_id;

    if not found then
      raise exception using errcode = '23503', message = 'The selected supplier does not exist or is deleted.';
    end if;
  end if;

  if p_operation_id is null then
    insert into public.receipt_operations (
      receipt_date, supplier_id, supplier_name_snapshot
    )
    values (
      p_receipt_date, p_supplier_id, v_supplier_name
    )
    returning id into v_operation_id;
  else
    update public.receipt_operations
      set receipt_date = p_receipt_date,
          supplier_id = p_supplier_id,
          supplier_name_snapshot = v_supplier_name
      where id = p_operation_id and deleted_at is null
      returning id into v_operation_id;

    if v_operation_id is null then
      raise exception using errcode = 'P0002', message = 'Active receipt was not found.';
    end if;

    delete from public.receipt_lines where operation_id = v_operation_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_item_id := nullif(v_line ->> 'item_id', '')::uuid;
    v_unit_id := nullif(v_line ->> 'unit_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity', '')::numeric;

    if v_item_id is null or v_quantity is null then
      raise exception using errcode = '22023', message = 'Every receipt line requires an item and quantity.';
    end if;

    if v_quantity <= 0 or v_quantity <> trunc(v_quantity, 2) then
      raise exception using errcode = '22023', message = 'Receipt quantity must be positive with at most two decimal places.';
    end if;

    select name into v_item_name
      from public.catalog_items
      where id = v_item_id;

    if not found then
      raise exception using errcode = '23503', message = 'The selected item does not exist or is deleted.';
    end if;

    v_unit_name := null;
    if v_unit_id is not null then
      select name into v_unit_name
        from public.measurement_units
        where id = v_unit_id;

      if not found then
        raise exception using errcode = '23503', message = 'The selected measurement unit is not active.';
      end if;
    end if;

    insert into public.receipt_lines (
      operation_id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot
    )
    values (
      v_operation_id, v_item_id, v_item_name, v_quantity, v_unit_id, v_unit_name
    );
  end loop;

  return v_operation_id;
end;
$function$;

revoke all on function public.save_receipt(uuid, date, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_receipt(uuid, date, uuid, jsonb) to service_role;


commit;
