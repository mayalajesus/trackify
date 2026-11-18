-- Supabase can grant API roles privileges through ALTER DEFAULT PRIVILEGES.
-- These internal markers/functions are exclusively accessed by the server.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on public.read_revisions from %I', role_name);
      execute format('revoke all on function public.bump_read_revision(text,text,text) from %I', role_name);
      execute format('revoke all on function public.track_read_revision() from %I', role_name);
    end if;
  end loop;
end;
$$;
