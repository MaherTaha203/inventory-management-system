-- Core catalog tables for the Inventory & Receiving system.
-- Apply only after reviewing this migration. This file is not applied to Supabase by this commit.

begin;

-- Existing project defaults grant broad access to objects created in public.
-- Opt future objects out of those defaults; each migration grants only what it needs.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create or replace function public.normalize_catalog_name(input_name text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select btrim(regexp_replace(
    regexp_replace(
      translate(
        normalize(input_name, NFC),
        'أإآٱ',
        'اااا'
      ),
      U&'[\064B-\065F\0670\0640]',
      '',
      'g'
    ),
    E'\\s+',
    ' ',
    'g'
  ));
$function$;

revoke all on function public.normalize_catalog_name(text) from public, anon, authenticated, service_role;
grant execute on function public.normalize_catalog_name(text) to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (public.normalize_catalog_name(name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_at timestamptz,
  constraint catalog_items_name_not_blank check (normalized_name <> ''),
  constraint catalog_items_name_trimmed check (name = btrim(name)),
  constraint catalog_items_name_length check (char_length(name) <= 200),
  constraint catalog_items_trash_dates_consistent check (
    (deleted_at is null and purge_at is null)
    or
    (deleted_at is not null and purge_at is not null and purge_at > deleted_at)
  )
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (public.normalize_catalog_name(name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_at timestamptz,
  constraint suppliers_name_not_blank check (normalized_name <> ''),
  constraint suppliers_name_trimmed check (name = btrim(name)),
  constraint suppliers_name_length check (char_length(name) <= 200),
  constraint suppliers_trash_dates_consistent check (
    (deleted_at is null and purge_at is null)
    or
    (deleted_at is not null and purge_at is not null and purge_at > deleted_at)
  )
);

create table public.measurement_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint measurement_units_name_not_blank check (btrim(name) <> ''),
  constraint measurement_units_name_trimmed check (name = btrim(name)),
  constraint measurement_units_name_length check (char_length(name) <= 80),
  constraint measurement_units_name_unique unique (name)
);

create index catalog_items_active_name_idx
  on public.catalog_items (normalized_name)
  where deleted_at is null;

create index suppliers_active_name_idx
  on public.suppliers (normalized_name)
  where deleted_at is null;

create index catalog_items_deleted_purge_idx
  on public.catalog_items (purge_at)
  where deleted_at is not null;

create index suppliers_deleted_purge_idx
  on public.suppliers (purge_at)
  where deleted_at is not null;

create trigger catalog_items_set_updated_at
before update on public.catalog_items
for each row execute function public.set_updated_at();

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

alter table public.catalog_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.measurement_units enable row level security;

revoke all on table public.catalog_items from public, anon, authenticated, service_role;
revoke all on table public.suppliers from public, anon, authenticated, service_role;
revoke all on table public.measurement_units from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.catalog_items to service_role;
grant select, insert, update, delete on table public.suppliers to service_role;
grant select, insert, update, delete on table public.measurement_units to service_role;

commit;
