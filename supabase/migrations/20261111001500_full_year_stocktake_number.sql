-- Align annual stocktake numbering with the approved YYYY-NNN format.

begin;

alter table public.stocktake_operations
  drop constraint stocktake_operations_number_format;

alter table public.stocktake_operations
  add constraint stocktake_operations_number_format check (
    operation_number = operation_year::text || '-' || lpad(operation_sequence::text, 3, '0')
  );

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

  insert into public.stocktake_counters as counter (operation_year, last_sequence)
  values (v_year::smallint, 1)
  on conflict (operation_year)
  do update
    set last_sequence = counter.last_sequence + 1
  returning last_sequence into v_sequence;

  new.operation_year := v_year::smallint;
  new.operation_sequence := v_sequence;
  new.operation_number :=
    v_year::text || '-' || lpad(v_sequence::text, 3, '0');

  return new;
end;
$function$;

commit;
