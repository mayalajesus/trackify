alter table public.clients
  add column if not exists contracted_hours numeric;

alter table public.clients
  add constraint clients_contracted_hours_positive
  check (contracted_hours is null or (contracted_hours > 0 and contracted_hours < 'Infinity'::numeric));
