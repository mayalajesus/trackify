alter table public.clients
  add column if not exists status text not null default 'active'
    check (status in ('active', 'on-hold', 'archived')),
  add column if not exists member_ids uuid[] not null default '{}';
