-- Text representation used for partial receipt-number archive searches.

begin;

alter table public.receipt_operations
  add column receipt_number_text text
  generated always as (receipt_number::text) stored;

create index receipt_operations_number_text_idx
  on public.receipt_operations (receipt_number_text);

commit;
