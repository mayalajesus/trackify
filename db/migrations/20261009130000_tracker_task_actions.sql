alter table public.active_timers add column if not exists task_details jsonb;
alter table public.time_entries add column if not exists task_details jsonb;
create table public.task_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  invited_by text not null references public.profiles(id) on delete cascade,
  recipient_id text not null references public.profiles(id) on delete cascade,
  project_id uuid not null,
  task text not null,
  task_details jsonb not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(workspace_id,task_id,recipient_id),
  foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade
);
create index task_invitations_inbox on public.task_invitations(recipient_id,workspace_id,status);
alter table public.task_invitations enable row level security;
