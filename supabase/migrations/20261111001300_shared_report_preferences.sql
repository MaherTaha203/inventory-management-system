-- Shared report column preferences across devices.

begin;

create table public.report_preferences (
  singleton boolean primary key default true,
  stocktake_columns jsonb not null default '["operation_number","operation_date","item_name","quantity","unit_name"]'::jsonb,
  receipt_columns jsonb not null default '["receipt_number","receipt_date","item_name","quantity","unit_name","supplier_name"]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint report_preferences_singleton check (singleton),
  constraint report_preferences_stocktake_array check (jsonb_typeof(stocktake_columns) = 'array'),
  constraint report_preferences_receipt_array check (jsonb_typeof(receipt_columns) = 'array')
);

insert into public.report_preferences (singleton)
values (true);

alter table public.report_preferences enable row level security;
revoke all on table public.report_preferences from public, anon, authenticated, service_role;
grant select, update on table public.report_preferences to service_role;

create policy report_preferences_service_role_access
  on public.report_preferences
  for all to service_role
  using (true) with check (true);

commit;
