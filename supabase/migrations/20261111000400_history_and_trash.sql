-- Rename history, unified trash view, restore, and permanent purge routines.

begin;

create table public.item_name_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.catalog_items(id) on delete set null,
  old_name text not null,
  new_name text not null,
  changed_at timestamptz not null default now(),
  constraint item_name_history_old_name_not_blank check (btrim(old_name) <> ''),
  constraint item_name_history_new_name_not_blank check (btrim(new_name) <> '')
);

create index item_name_history_item_changed_idx
  on public.item_name_history (item_id, changed_at desc);

create or replace function public.propagate_catalog_item_rename()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.name is distinct from old.name then
    insert into public.item_name_history (item_id, old_name, new_name)
    values (new.id, old.name, new.name);

    update public.stocktake_lines
      set item_name_snapshot = new.name
      where item_id = new.id;

    update public.receipt_lines
      set item_name_snapshot = new.name
      where item_id = new.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.propagate_catalog_item_rename() from public, anon, authenticated, service_role;

create trigger catalog_items_propagate_rename
after update of name on public.catalog_items
for each row execute function public.propagate_catalog_item_rename();

create view public.trash_entries
with (security_invoker = true)
as
  select
    'stocktake'::text as entry_type,
    id as entry_id,
    operation_number as display_name,
    deleted_at,
    purge_at
  from public.stocktake_operations
  where deleted_at is not null

  union all

  select
    'receipt'::text,
    id,
    receipt_number::text,
    deleted_at,
    purge_at
  from public.receipt_operations
  where deleted_at is not null

  union all

  select
    'item'::text,
    id,
    name,
    deleted_at,
    purge_at
  from public.catalog_items
  where deleted_at is not null

  union all

  select
    'supplier'::text,
    id,
    name,
    deleted_at,
    purge_at
  from public.suppliers
  where deleted_at is not null;

revoke all on public.trash_entries from public, anon, authenticated, service_role;
grant select on public.trash_entries to service_role;

create or replace function public.restore_trash_entry(
  p_entry_type text,
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  case p_entry_type
    when 'stocktake' then
      update public.stocktake_operations
        set deleted_at = null, purge_at = null
        where id = p_entry_id
          and deleted_at is not null
          and purge_at > now();
    when 'receipt' then
      update public.receipt_operations
        set deleted_at = null, purge_at = null
        where id = p_entry_id
          and deleted_at is not null
          and purge_at > now();
    when 'item' then
      update public.catalog_items
        set deleted_at = null, purge_at = null
        where id = p_entry_id
          and deleted_at is not null
          and purge_at > now();
    when 'supplier' then
      update public.suppliers
        set deleted_at = null, purge_at = null
        where id = p_entry_id
          and deleted_at is not null
          and purge_at > now();
    else
      raise exception using errcode = '22023', message = 'Unsupported trash entry type.';
  end case;

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$function$;

revoke all on function public.restore_trash_entry(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_trash_entry(text, uuid) to service_role;

create or replace function public.purge_trash_entry(
  p_entry_type text,
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  case p_entry_type
    when 'stocktake' then
      delete from public.stocktake_operations
        where id = p_entry_id and deleted_at is not null;
    when 'receipt' then
      delete from public.receipt_operations
        where id = p_entry_id and deleted_at is not null;
    when 'item' then
      delete from public.catalog_items
        where id = p_entry_id and deleted_at is not null;
    when 'supplier' then
      delete from public.suppliers
        where id = p_entry_id and deleted_at is not null;
    else
      raise exception using errcode = '22023', message = 'Unsupported trash entry type.';
  end case;

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$function$;

revoke all on function public.purge_trash_entry(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.purge_trash_entry(text, uuid) to service_role;

create or replace function public.purge_expired_trash()
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
    where deleted_at is not null and purge_at <= now();
  get diagnostics v_stocktakes = row_count;

  delete from public.receipt_operations
    where deleted_at is not null and purge_at <= now();
  get diagnostics v_receipts = row_count;

  delete from public.catalog_items
    where deleted_at is not null and purge_at <= now();
  get diagnostics v_items = row_count;

  delete from public.suppliers
    where deleted_at is not null and purge_at <= now();
  get diagnostics v_suppliers = row_count;

  return jsonb_build_object(
    'stocktakes', v_stocktakes,
    'receipts', v_receipts,
    'items', v_items,
    'suppliers', v_suppliers
  );
end;
$function$;

revoke all on function public.purge_expired_trash() from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_trash() to service_role;

alter table public.item_name_history enable row level security;
revoke all on table public.item_name_history from public, anon, authenticated, service_role;
grant select on table public.item_name_history to service_role;

commit;
