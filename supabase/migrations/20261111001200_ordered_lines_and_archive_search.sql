-- Preserve input line order and provide complete paginated archive search.

begin;

alter table public.stocktake_lines
  add column line_position integer not null default 1;

alter table public.receipt_lines
  add column line_position integer not null default 1;

alter table public.stocktake_lines
  add constraint stocktake_lines_position_unique unique (operation_id, line_position);

alter table public.receipt_lines
  add constraint receipt_lines_position_unique unique (operation_id, line_position);

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
  v_position integer;
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

  for v_line, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_lines) with ordinality as line(value, ordinality)
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
      operation_id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot, line_position
    )
    values (
      v_operation_id, v_item_id, v_item_name, v_quantity, v_unit_id, v_unit_name, v_position
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
  v_position integer;
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

  for v_line, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_lines) with ordinality as line(value, ordinality)
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
      operation_id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot, line_position
    )
    values (
      v_operation_id, v_item_id, v_item_name, v_quantity, v_unit_id, v_unit_name, v_position
    );
  end loop;

  return v_operation_id;
end;
$function$;

revoke all on function public.save_receipt(uuid, date, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_receipt(uuid, date, uuid, jsonb) to service_role;

create or replace function public.search_stocktakes(
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_pattern text;
  v_total bigint;
  v_entries jsonb;
begin
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'Invalid pagination parameters.';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'Start date must not be after end date.';
  end if;

  v_pattern := case
    when p_query is null or btrim(p_query) = '' then null
    else '%' ||
      replace(
        replace(
          replace(btrim(p_query), E'\\', E'\\\\'),
          '%', E'\\%'
        ),
        '_', E'\\_'
      ) || '%'
  end;

  with filtered as (
    select o.id, o.operation_number, o.operation_date, o.operation_sequence
    from public.stocktake_operations o
    where o.deleted_at is null
      and (p_from is null or o.operation_date >= p_from)
      and (p_to is null or o.operation_date <= p_to)
      and (
        v_pattern is null
        or o.operation_number ilike v_pattern escape E'\\'
        or exists (
          select 1
          from public.stocktake_lines l
          where l.operation_id = o.id
            and l.item_name_snapshot ilike v_pattern escape E'\\'
        )
      )
  ),
  counted as (
    select count(*)::bigint as total_rows from filtered
  ),
  page_rows as (
    select *
    from filtered
    order by operation_date desc, operation_sequence desc
    limit p_page_size
    offset (p_page - 1) * p_page_size
  )
  select
    (select total_rows from counted),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'operation_number', p.operation_number,
          'operation_date', p.operation_date,
          'stocktake_lines', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', l.id,
                  'item_id', l.item_id,
                  'item_name_snapshot', l.item_name_snapshot,
                  'quantity', l.quantity,
                  'unit_id', l.unit_id,
                  'unit_name_snapshot', l.unit_name_snapshot,
                  'line_position', l.line_position
                )
                order by l.line_position
              ),
              '[]'::jsonb
            )
            from public.stocktake_lines l
            where l.operation_id = p.id
          )
        )
        order by p.operation_date desc, p.operation_sequence desc
      ),
      '[]'::jsonb
    )
  into v_total, v_entries
  from page_rows p;

  return jsonb_build_object(
    'entries', v_entries,
    'page', p_page,
    'pageSize', p_page_size,
    'totalRows', v_total,
    'totalPages', ceil(v_total::numeric / p_page_size)::integer
  );
end;
$function$;

create or replace function public.search_receipts(
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_pattern text;
  v_total bigint;
  v_entries jsonb;
begin
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'Invalid pagination parameters.';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'Start date must not be after end date.';
  end if;

  v_pattern := case
    when p_query is null or btrim(p_query) = '' then null
    else '%' ||
      replace(
        replace(
          replace(btrim(p_query), E'\\', E'\\\\'),
          '%', E'\\%'
        ),
        '_', E'\\_'
      ) || '%'
  end;

  with filtered as (
    select o.id, o.receipt_number, o.receipt_number_text, o.receipt_date,
           o.supplier_name_snapshot
    from public.receipt_operations o
    where o.deleted_at is null
      and (p_from is null or o.receipt_date >= p_from)
      and (p_to is null or o.receipt_date <= p_to)
      and (
        v_pattern is null
        or o.receipt_number_text ilike v_pattern escape E'\\'
        or coalesce(o.supplier_name_snapshot, '') ilike v_pattern escape E'\\'
        or exists (
          select 1
          from public.receipt_lines l
          where l.operation_id = o.id
            and l.item_name_snapshot ilike v_pattern escape E'\\'
        )
      )
  ),
  counted as (
    select count(*)::bigint as total_rows from filtered
  ),
  page_rows as (
    select *
    from filtered
    order by receipt_date desc, receipt_number desc
    limit p_page_size
    offset (p_page - 1) * p_page_size
  )
  select
    (select total_rows from counted),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'receipt_number', p.receipt_number,
          'receipt_date', p.receipt_date,
          'supplier_name_snapshot', p.supplier_name_snapshot,
          'receipt_lines', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', l.id,
                  'item_id', l.item_id,
                  'item_name_snapshot', l.item_name_snapshot,
                  'quantity', l.quantity,
                  'unit_id', l.unit_id,
                  'unit_name_snapshot', l.unit_name_snapshot,
                  'line_position', l.line_position
                )
                order by l.line_position
              ),
              '[]'::jsonb
            )
            from public.receipt_lines l
            where l.operation_id = p.id
          )
        )
        order by p.receipt_date desc, p.receipt_number desc
      ),
      '[]'::jsonb
    )
  into v_total, v_entries
  from page_rows p;

  return jsonb_build_object(
    'entries', v_entries,
    'page', p_page,
    'pageSize', p_page_size,
    'totalRows', v_total,
    'totalPages', ceil(v_total::numeric / p_page_size)::integer
  );
end;
$function$;

revoke all on function public.search_stocktakes(text, date, date, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.search_receipts(text, date, date, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_stocktakes(text, date, date, integer, integer) to service_role;
grant execute on function public.search_receipts(text, date, date, integer, integer) to service_role;

commit;
