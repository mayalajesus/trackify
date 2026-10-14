-- Keep membership identity for historical time entries while ending the link.
alter table public.workspace_members add column if not exists deleted_at timestamptz;
alter table public.workspace_members add constraint deleted_membership_is_removed
  check (deleted_at is null or status = 'removed');
