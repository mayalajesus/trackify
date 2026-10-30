-- Only active timers may omit a task. Completed time entries keep their constraint.
alter table public.active_timers drop constraint active_timers_task_check;
alter table public.active_timers add constraint active_timers_task_check
  check (char_length(trim(task)) between 0 and 240);
