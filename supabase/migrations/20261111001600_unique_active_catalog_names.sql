-- Prevent concurrent creation of active catalog names that normalize identically.
-- Deleted entries are excluded so a new similar entry can be created after warning.

begin;

create unique index catalog_items_active_normalized_name_uidx
  on public.catalog_items (normalized_name)
  where deleted_at is null;

create unique index suppliers_active_normalized_name_uidx
  on public.suppliers (normalized_name)
  where deleted_at is null;

commit;
