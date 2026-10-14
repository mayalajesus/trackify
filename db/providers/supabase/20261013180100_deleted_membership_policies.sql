-- Browser clients cannot clear tombstones or delete historical memberships.
-- The server connection accepts a fresh invitation through the dedicated API.
create policy members_deleted_update_guard on public.workspace_members
  as restrictive for update to authenticated
  using (deleted_at is null) with check (deleted_at is null);
create policy members_deleted_delete_guard on public.workspace_members
  as restrictive for delete to authenticated using (deleted_at is null);
