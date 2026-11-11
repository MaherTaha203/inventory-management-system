-- Receipt operations and permanent sequential numbering.

begin;

create table public.receipt_number_counter (
  singleton boolean primary key default true,
  last_sequence bigint not null default 0,
  constraint receipt_number_counter_singleton check (singleton),
  constraint receipt_number_counter_nonnegative check (last_sequence >= 0)
);

insert into public.receipt_number_counter (singleton, last_sequence)
values (true, 0);

create table public.receipt_operations (
  id uuid primary key default gen_random_uuid(),
  receipt_number bigint not null unique,
  receipt_date date not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_at timestamptz,
  constraint receipt_operations_number_positive check (receipt_number > 0),
  constraint receipt_operations_supplier_snapshot_valid check (
    supplier_name_snapshot is null or btrim(supplier_name_snapshot) <> ''
  ),
  constraint receipt_operations_trash_dates_consistent check (
    (deleted_at is null and purge_at is null)
    or
    (deleted_at is not null and purge_at is not null and purge_at > deleted_at)
  )
);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.receipt_operations(id) on delete cascade,
  item_id uuid references public.catalog_items(id) on delete set null,
  item_name_snapshot text not null,
  quantity numeric not null,
  unit_id uuid references public.measurement_units(id) on delete set null,
  unit_name_snapshot text,
  constraint receipt_lines_item_snapshot_not_blank check (btrim(item_name_snapshot) <> ''),
  constraint receipt_lines_quantity_positive check (quantity > 0),
  constraint receipt_lines_quantity_max_two_decimals check (quantity = trunc(quantity, 2)),
  constraint receipt_lines_unit_snapshot_consistent check (
    unit_name_snapshot is null or btrim(unit_name_snapshot) <> ''
  )
);

create index receipt_operations_date_idx
  on public.receipt_operations (receipt_date desc, receipt_number desc)
  where deleted_at is null;

create index receipt_operations_supplier_date_idx
  on public.receipt_operations (supplier_id, receipt_date desc, receipt_number desc)
  where deleted_at is null;

create index receipt_operations_deleted_purge_idx
  on public.receipt_operations (purge_at)
  where deleted_at is not null;

create index receipt_lines_operation_idx
  on public.receipt_lines (operation_id);

create index receipt_lines_item_idx
  on public.receipt_lines (item_id);

create or replace function public.assign_receipt_number()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.receipt_date > current_date
     or new.receipt_date < (current_date - interval '1 year')::date then
    raise exception using
      errcode = '22007',
      message = 'Receipt date must be within the previous year and cannot be in the future.';
  end if;

  if tg_op = 'INSERT' then
    update public.receipt_number_counter
      set last_sequence = last_sequence + 1
      where singleton = true
      returning last_sequence into new.receipt_number;

    if new.receipt_number is null then
      raise exception using
        errcode = '55000',
        message = 'Receipt number counter is missing.';
    end if;
  else
    if new.receipt_number <> old.receipt_number then
      raise exception using
        errcode = '22023',
        message = 'A saved receipt number cannot be changed.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.assign_receipt_number() from public, anon, authenticated, service_role;

create trigger receipt_operations_assign_number
before insert or update of receipt_date, receipt_number
on public.receipt_operations
for each row execute function public.assign_receipt_number();

create trigger receipt_operations_set_updated_at
before update on public.receipt_operations
for each row execute function public.set_updated_at();

alter table public.receipt_number_counter enable row level security;
alter table public.receipt_operations enable row level security;
alter table public.receipt_lines enable row level security;

revoke all on table public.receipt_number_counter from public, anon, authenticated, service_role;
revoke all on table public.receipt_operations from public, anon, authenticated, service_role;
revoke all on table public.receipt_lines from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.receipt_number_counter to service_role;
grant select, insert, update, delete on table public.receipt_operations to service_role;
grant select, insert, update, delete on table public.receipt_lines to service_role;

commit;
