-- Keep an explicit relation to each original interval (a task can have many).
alter table public.time_entries add column shared_source_entry_id uuid;
alter table public.time_entries add constraint time_entries_id_workspace_unique unique(id, workspace_id);
alter table public.time_entries add constraint time_entries_shared_source_fk
  foreign key (shared_source_entry_id, workspace_id)
  references public.time_entries(id, workspace_id) on delete cascade;
create unique index time_entries_shared_recipient
  on public.time_entries(shared_source_entry_id, user_id);

-- Attach existing copies only where the original interval is unambiguous.
with matches as (
  select copy.id, min(source.id::text)::uuid as source_id
  from public.time_entries copy
  join public.task_invitations i on i.workspace_id=copy.workspace_id
    and i.recipient_id=copy.user_id and i.status='accepted'
    and i.task_id::text=copy.task_details->>'id'
  join public.time_entries source on source.workspace_id=copy.workspace_id
    and source.user_id=i.invited_by and source.task_details->>'id'=i.task_id::text
    and source.date=copy.date and source.start_time=copy.start_time
    and source.end_date=copy.end_date and source.end_time=copy.end_time
    and source.duration_seconds=copy.duration_seconds
  group by copy.id having count(*)=1
), unique_copies as (
  select m.*, count(*) over (partition by source_id,e.user_id) as copies
  from matches m join public.time_entries e on e.id=m.id
)
update public.time_entries e set shared_source_entry_id=m.source_id
from unique_copies m where e.id=m.id and m.copies=1;
