-- Annual stocktake operations and line items.
-- The sequence counter is intentionally retained after operation deletion.

begin;

create table public.stocktake_counters (
  operation_year smallint primary key,
  last_sequence integer not null,
  constraint stocktake_counters_year_valid check (operation_year between 2000 and 2099),
  constraint stocktake_counters_sequence_positive check (last_sequence >= 0)
);

create table public.stocktake_operations (
  id uuid primary key default gen_random_uuid(),
  operation_number text not null,
  operation_year smallint not null,
  operation_sequence integer not null,
  operation_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_at timestamptz,
  constraint stocktake_operations_number_unique unique (operation_number),
  constraint stocktake_operations_year_sequence_unique unique (operation_year, operation_sequence),
  constraint stocktake_operations_year_valid check (operation_year between 2000 and 2099),
  constraint stocktake_operations_sequence_positive check (operation_sequence > 0),
  constraint stocktake_operations_number_format check (
    operation_number = lpad((operation_year % 100)::text, 2, '0')
      || '/'
      || lpad(operation_sequence::text, 3, '0')
  ),
  constraint stocktake_operations_trash_dates_consistent check (
    (deleted_at is null and purge_at is null)
    or
    (deleted_at is not null and purge_at is not null and purge_at > deleted_at)
  )
);

create table public.stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.stocktake_operations(id) on delete cascade,
  item_id uuid references public.catalog_items(id) on delete set null,
  item_name_snapshot text not null,
  quantity numeric not null,
  unit_id uuid references public.measurement_units(id) on delete set null,
  unit_name_snapshot text,
  constraint stocktake_lines_item_snapshot_not_blank check (btrim(item_name_snapshot) <> ''),
  constraint stocktake_lines_quantity_nonnegative check (quantity >= 0),
  constraint stocktake_lines_quantity_max_two_decimals check (quantity = trunc(quantity, 2)),
  constraint stocktake_lines_unit_snapshot_consistent check (
    unit_name_snapshot is null or btrim(unit_name_snapshot) <> ''
  )
);

create index stocktake_operations_date_idx
  on public.stocktake_operations (operation_date desc, operation_year desc, operation_sequence desc)
  where deleted_at is null;

create index stocktake_operations_deleted_purge_idx
  on public.stocktake_operations (purge_at)
  where deleted_at is not null;

create index stocktake_lines_operation_idx
  on public.stocktake_lines (operation_id);

create index stocktake_lines_item_idx
  on public.stocktake_lines (item_id);

create or replace function public.assign_stocktake_number()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_year integer;
  v_sequence integer;
begin
  if new.operation_date > current_date
     or new.operation_date < (current_date - interval '1 year')::date then
    raise exception using
      errcode = '22007',
      message = 'Stocktake date must be within the previous year and cannot be in the future.';
  end if;

  v_year := extract(year from new.operation_date)::integer;

  if tg_op = 'UPDATE' then
    if v_year <> old.operation_year then
      raise exception using
        errcode = '22023',
        message = 'The year of a saved stocktake cannot be changed.';
    end if;

    if new.operation_year <> old.operation_year
       or new.operation_sequence <> old.operation_sequence
       or new.operation_number <> old.operation_number then
      raise exception using
        errcode = '22023',
        message = 'A saved stocktake number cannot be changed.';
    end if;

    new.operation_year := old.operation_year;
    new.operation_sequence := old.operation_sequence;
    new.operation_number := old.operation_number;
    new.updated_at := now();
    return new;
  end if;

  insert into public.stocktake_counters (operation_year, last_sequence)
  values (v_year::smallint, 1)
  on conflict (operation_year)
  do update
    set last_sequence = public.stocktake_counters.last_sequence + 1
  returning last_sequence into v_sequence;

  new.operation_year := v_year::smallint;
  new.operation_sequence := v_sequence;
  new.operation_number :=
    lpad((v_year % 100)::text, 2, '0') || '/' || lpad(v_sequence::text, 3, '0');

  return new;
end;
$function$;

revoke all on function public.assign_stocktake_number() from public, anon, authenticated, service_role;

create trigger stocktake_operations_assign_number
before insert or update of operation_date, operation_number, operation_year, operation_sequence
on public.stocktake_operations
for each row execute function public.assign_stocktake_number();

create trigger stocktake_operations_set_updated_at
before update on public.stocktake_operations
for each row execute function public.set_updated_at();

alter table public.stocktake_counters enable row level security;
alter table public.stocktake_operations enable row level security;
alter table public.stocktake_lines enable row level security;

revoke all on table public.stocktake_counters from public, anon, authenticated, service_role;
revoke all on table public.stocktake_operations from public, anon, authenticated, service_role;
revoke all on table public.stocktake_lines from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.stocktake_counters to service_role;
grant select, insert, update, delete on table public.stocktake_operations to service_role;
grant select, insert, update, delete on table public.stocktake_lines to service_role;

commit;
