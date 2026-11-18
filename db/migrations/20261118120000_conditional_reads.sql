-- Small, durable invalidation markers. They contain no account data and are
-- updated in the transaction that changes the source row, including deletions.
create table public.read_revisions (
  scope text not null,
  scope_id text not null,
  domain text not null,
  revision bigint not null default 1,
  primary key (scope, scope_id, domain)
);
alter table public.read_revisions enable row level security;
revoke all on public.read_revisions from public;

create function public.bump_read_revision(p_scope text, p_id text, p_domain text)
returns void language sql security definer set search_path = pg_catalog, public as $$
  insert into public.read_revisions(scope, scope_id, domain)
  values(p_scope, p_id, p_domain)
  on conflict(scope, scope_id, domain) do update
    set revision = read_revisions.revision + 1;
$$;
revoke all on function public.bump_read_revision(text, text, text) from public;

create function public.track_read_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  item jsonb;
  wid text;
  uid text;
  domain_name text;
  member_workspace record;
  keys jsonb := '[]'::jsonb;
  revision_key jsonb;
begin
  -- Touching a technical timestamp alone does not change any read response.
  if tg_op = 'UPDATE' and (old_row - 'updated_at') = (new_row - 'updated_at') then
    return new;
  end if;
  -- Cover both sides of moves and deduplicate identical scopes on updates.
  for item in select distinct value from jsonb_array_elements(jsonb_build_array(old_row, new_row))
              where value <> 'null'::jsonb order by value loop
    if tg_table_name in ('profiles', 'user_preferences') then
      uid := case when tg_table_name = 'profiles' then item->>'id' else item->>'user_id' end;
      keys := keys || jsonb_build_array(jsonb_build_array('user', uid, tg_table_name));
      if tg_table_name = 'profiles' or tg_op <> 'UPDATE'
         or (old_row->'avatar_data_url') is distinct from (new_row->'avatar_data_url') then
        for member_workspace in select workspace_id::text as id from public.workspace_members
                                where user_id = uid order by workspace_id loop
          keys := keys || jsonb_build_array(jsonb_build_array('workspace', member_workspace.id, 'people'));
        end loop;
      end if;
    else
      wid := case when tg_table_name = 'workspaces' then item->>'id' else item->>'workspace_id' end;
      domain_name := case tg_table_name
        when 'time_entries' then 'entries'
        when 'active_timers' then 'timers'
        when 'task_invitations' then 'collaboration'
        when 'workspace_invitations' then 'invitations'
        else 'catalog' end;
      keys := keys || jsonb_build_array(jsonb_build_array('workspace', wid, domain_name));
      if tg_table_name = 'time_entries' then
        keys := keys || jsonb_build_array(jsonb_build_array('workspace_user', wid || ':' || (item->>'user_id'), 'entries'));
      end if;
    end if;
  end loop;
  -- A moved row invalidates both scopes, locking keys in a stable order.
  for revision_key in select distinct value from jsonb_array_elements(keys) order by value loop
    perform public.bump_read_revision(revision_key->>0, revision_key->>1, revision_key->>2);
  end loop;
  return coalesce(new, old);
end;
$$;
revoke all on function public.track_read_revision() from public;

do $$
declare name text;
begin
  foreach name in array array['profiles', 'user_preferences', 'workspaces',
    'workspace_settings', 'workspace_members', 'clients', 'projects', 'project_members',
    'workspace_invitations', 'time_entries', 'active_timers', 'task_invitations'] loop
    execute format('create trigger track_read_revision after insert or update or delete on public.%I
                    for each row execute function public.track_read_revision()', name);
  end loop;
end;
$$;
