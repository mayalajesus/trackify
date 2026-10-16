create table public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  extension_id text not null check (extension_id ~ '^[a-p]{32}$'),
  access_hash text not null unique,
  refresh_hash text not null unique,
  access_expires_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.extension_sessions enable row level security;
revoke all on public.extension_sessions from public;
create index extension_sessions_user_idx on public.extension_sessions(user_id);
do $$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on public.extension_sessions from %I',role_name);
    end if;
  end loop;
end $$;
