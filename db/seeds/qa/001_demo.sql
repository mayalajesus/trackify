do $$
begin
  if current_setting('app.environment', true) is distinct from 'qa' then
    raise exception 'QA seeds can only run with app.environment=qa.';
  end if;
end;
$$;

do $$
declare
  owner_id text := (select id::text from neon_auth."user" where email = 'owner@example.test');
  admin_id text := (select id::text from neon_auth."user" where email = 'admin@example.test');
  member_id text := (select id::text from neon_auth."user" where email = 'member@example.test');
  v_workspace_id uuid := '10000000-0000-4000-8000-000000000001';
  work_date date;
  day_number integer;
  user_index integer;
  entry_number integer := 1;
  current_user_id text;
  project_one uuid;
  project_two uuid;
  start_one time;
  end_one time;
  start_two time;
  end_two time;
  task_one text;
  task_two text;
  description_one text;
  description_two text;
  billable_one boolean;
  billable_two boolean;
begin
  if owner_id is null or admin_id is null or member_id is null then
    raise exception 'QA seeds require owner, admin and member Neon Auth accounts.';
  end if;

  delete from public.active_timers where active_timers.workspace_id = v_workspace_id;
  delete from public.time_entries where time_entries.workspace_id = v_workspace_id;
  delete from public.workspace_invitations where workspace_invitations.workspace_id = v_workspace_id;
  delete from public.project_members where project_members.workspace_id = v_workspace_id;
  delete from public.projects where projects.workspace_id = v_workspace_id;
  delete from public.clients where clients.workspace_id = v_workspace_id;

  insert into public.profiles (id, auth_issuer, name, email, initials)
  values
    (owner_id, 'neon', 'Marina Costa', 'owner@example.test', 'MC'),
    (admin_id, 'neon', 'Caio Mendes', 'admin@example.test', 'CM'),
    (member_id, 'neon', 'Helena Duarte', 'member@example.test', 'HD')
  on conflict (id) do update
    set auth_issuer = excluded.auth_issuer,
        name = excluded.name,
        email = excluded.email,
        initials = excluded.initials,
        updated_at = now();

  insert into public.user_preferences (
    user_id, language, theme, timezone, reminders, weekly_digest,
    idle_detection
  )
  values
    (owner_id, 'pt-BR', 'system', 'America/Sao_Paulo', true, true, true),
    (admin_id, 'pt-BR', 'light', 'America/Sao_Paulo', true, false, true),
    (member_id, 'pt-BR', 'dark', 'America/Sao_Paulo', true, false, true)
  on conflict (user_id) do update
    set language = excluded.language,
        theme = excluded.theme,
        timezone = excluded.timezone,
        reminders = excluded.reminders,
        weekly_digest = excluded.weekly_digest,
        idle_detection = excluded.idle_detection,
        updated_at = now();

  insert into public.legal_acceptances (user_id, terms_version, privacy_version, locale)
  values
    (owner_id, '2026-09-03', '2026-09-03', 'pt-BR'),
    (admin_id, '2026-09-03', '2026-09-03', 'pt-BR'),
    (member_id, '2026-09-03', '2026-09-03', 'pt-BR')
  on conflict (user_id, terms_version, privacy_version) do nothing;

  insert into public.workspaces (id, name, owner_id, status)
  values (v_workspace_id, 'QA Trackify', owner_id, 'active')
  on conflict (id) do update
    set name = excluded.name,
        owner_id = excluded.owner_id,
        status = 'active',
        archived_at = null;

  insert into public.workspace_members (
    workspace_id, user_id, role, status, hourly_rate, currency, joined_at
  )
  values
    (v_workspace_id, owner_id, 'Owner', 'active', 180, 'BRL', timestamptz '2026-01-02 12:00:00+00'),
    (v_workspace_id, admin_id, 'Admin', 'active', 140, 'BRL', timestamptz '2026-01-03 12:00:00+00'),
    (v_workspace_id, member_id, 'Member', 'active', 95, 'BRL', timestamptz '2026-01-06 12:00:00+00')
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        hourly_rate = excluded.hourly_rate,
        currency = excluded.currency,
        joined_at = excluded.joined_at;

  insert into public.workspace_settings (workspace_id, week_start)
  values (v_workspace_id, 'monday')
  on conflict (workspace_id) do update
    set week_start = excluded.week_start,
        updated_at = now();

  insert into public.clients (id, workspace_id, name, contact)
  values
    ('20000000-0000-4000-8000-000000000001', v_workspace_id, 'Aurora Studio', 'contato@aurorastudio.example'),
    ('20000000-0000-4000-8000-000000000002', v_workspace_id, 'Norte Commerce', 'hello@nortecommerce.example'),
    ('20000000-0000-4000-8000-000000000003', v_workspace_id, 'Casa Verde Saúde', 'projetos@casaverde.example'),
    ('20000000-0000-4000-8000-000000000004', v_workspace_id, 'Ponte Educação', 'time@ponteedu.example'),
    ('20000000-0000-4000-8000-000000000005', v_workspace_id, 'Lumen Finanças', 'produto@lumenfin.example'),
    ('20000000-0000-4000-8000-000000000006', v_workspace_id, 'Orbe Logística', 'ops@orbelog.example')
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        name = excluded.name,
        contact = excluded.contact;

  insert into public.projects (id, workspace_id, name, client_id, billable, status, color, last_activity)
  values
    ('30000000-0000-4000-8000-000000000001', v_workspace_id, 'Website institucional', '20000000-0000-4000-8000-000000000001', true, 'active', '#38bdf8', date '2026-08-31'),
    ('30000000-0000-4000-8000-000000000002', v_workspace_id, 'Design system Aurora', '20000000-0000-4000-8000-000000000001', true, 'active', '#8b5cf6', date '2026-08-29'),
    ('30000000-0000-4000-8000-000000000003', v_workspace_id, 'Checkout e pagamentos', '20000000-0000-4000-8000-000000000002', true, 'active', '#10b981', date '2026-08-28'),
    ('30000000-0000-4000-8000-000000000004', v_workspace_id, 'Painel de métricas', '20000000-0000-4000-8000-000000000002', true, 'active', '#f59e0b', date '2026-08-27'),
    ('30000000-0000-4000-8000-000000000005', v_workspace_id, 'Portal do paciente', '20000000-0000-4000-8000-000000000003', true, 'active', '#ec4899', date '2026-08-26'),
    ('30000000-0000-4000-8000-000000000006', v_workspace_id, 'Operação interna', '20000000-0000-4000-8000-000000000004', false, 'active', '#64748b', date '2026-08-25'),
    ('30000000-0000-4000-8000-000000000007', v_workspace_id, 'Conteúdo e SEO', '20000000-0000-4000-8000-000000000005', true, 'active', '#ef4444', date '2026-08-22'),
    ('30000000-0000-4000-8000-000000000008', v_workspace_id, 'Campanha de lançamento', '20000000-0000-4000-8000-000000000006', true, 'on-hold', '#f97316', date '2026-07-31'),
    ('30000000-0000-4000-8000-000000000009', v_workspace_id, 'Site legado', '20000000-0000-4000-8000-000000000001', true, 'archived', '#64748b', date '2026-03-20');

  insert into public.project_members (workspace_id, project_id, user_id)
  values
    (v_workspace_id, '30000000-0000-4000-8000-000000000001', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000001', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000001', member_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000002', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000002', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000003', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000003', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000004', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000004', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000004', member_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000005', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000005', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000006', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000006', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000007', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000007', member_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000008', owner_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000008', admin_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000008', member_id),
    (v_workspace_id, '30000000-0000-4000-8000-000000000009', owner_id);

  work_date := date '2026-01-01';
  while work_date <= date '2026-08-31' loop
    if extract(isodow from work_date) between 1 and 5 then
      day_number := work_date - date '2026-01-01';

      for user_index in 1..3 loop
        current_user_id := case user_index when 1 then owner_id when 2 then admin_id else member_id end;

        if user_index = 1 then
          project_one := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000001'::uuid
            when 1 then '30000000-0000-4000-8000-000000000002'::uuid
            when 2 then '30000000-0000-4000-8000-000000000003'::uuid
            when 3 then '30000000-0000-4000-8000-000000000004'::uuid
            else '30000000-0000-4000-8000-000000000007'::uuid
          end;
          project_two := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000003'::uuid
            when 1 then '30000000-0000-4000-8000-000000000004'::uuid
            when 2 then '30000000-0000-4000-8000-000000000005'::uuid
            when 3 then '30000000-0000-4000-8000-000000000006'::uuid
            else '30000000-0000-4000-8000-000000000008'::uuid
          end;
        elsif user_index = 2 then
          project_one := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000003'::uuid
            when 1 then '30000000-0000-4000-8000-000000000004'::uuid
            when 2 then '30000000-0000-4000-8000-000000000005'::uuid
            when 3 then '30000000-0000-4000-8000-000000000006'::uuid
            else '30000000-0000-4000-8000-000000000008'::uuid
          end;
          project_two := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000001'::uuid
            when 1 then '30000000-0000-4000-8000-000000000002'::uuid
            when 2 then '30000000-0000-4000-8000-000000000004'::uuid
            when 3 then '30000000-0000-4000-8000-000000000007'::uuid
            else '30000000-0000-4000-8000-000000000001'::uuid
          end;
        else
          project_one := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000001'::uuid
            when 1 then '30000000-0000-4000-8000-000000000004'::uuid
            when 2 then '30000000-0000-4000-8000-000000000007'::uuid
            when 3 then '30000000-0000-4000-8000-000000000001'::uuid
            else '30000000-0000-4000-8000-000000000004'::uuid
          end;
          project_two := case day_number % 5
            when 0 then '30000000-0000-4000-8000-000000000007'::uuid
            when 1 then '30000000-0000-4000-8000-000000000001'::uuid
            when 2 then '30000000-0000-4000-8000-000000000004'::uuid
            when 3 then '30000000-0000-4000-8000-000000000008'::uuid
            else '30000000-0000-4000-8000-000000000003'::uuid
          end;
        end if;

        start_one := time '09:00' + ((day_number + user_index) % 3) * interval '15 minutes';
        end_one := start_one + interval '3 hours';
        start_two := time '13:00' + ((day_number + user_index + 1) % 3) * interval '15 minutes';
        end_two := start_two + case when (day_number + user_index) % 4 = 0 then interval '3 hours 30 minutes' else interval '4 hours' end;
        billable_one := (day_number + user_index) % 6 <> 0;
        billable_two := (day_number + user_index) % 9 <> 0;

        if user_index = 1 then
          task_one := case day_number % 4 when 0 then 'Direção de produto' when 1 then 'Revisão com cliente' when 2 then 'Planejamento do sprint' else 'Arquitetura da solução' end;
          task_two := case day_number % 4 when 0 then 'Implementação frontend' when 1 then 'Ajustes de interface' when 2 then 'Validação da entrega' else 'Documentação do projeto' end;
        elsif user_index = 2 then
          task_one := case day_number % 4 when 0 then 'Coordenação do projeto' when 1 then 'Desenvolvimento web' when 2 then 'Revisão técnica' else 'Análise de métricas' end;
          task_two := case day_number % 4 when 0 then 'Integração de serviços' when 1 then 'Correção de bugs' when 2 then 'Refinamento de backlog' else 'Reunião de alinhamento' end;
        else
          task_one := case day_number % 4 when 0 then 'Implementação de componentes' when 1 then 'Testes funcionais' when 2 then 'Ajustes responsivos' else 'Publicação de conteúdo' end;
          task_two := case day_number % 4 when 0 then 'Correção de QA' when 1 then 'Revisão de acessibilidade' when 2 then 'Atualização de documentação' else 'Suporte ao cliente' end;
        end if;

        description_one := case user_index when 1 then 'Decisões de produto e acompanhamento da entrega.' when 2 then 'Execução técnica e coordenação das próximas etapas.' else 'Produção, validação e melhorias incrementais.' end;
        description_two := case when billable_two then 'Atividade planejada no ciclo de trabalho.' else 'Rotina interna de operação e melhoria contínua.' end;

        insert into public.time_entries (
          id, workspace_id, user_id, date, start_time, end_time, end_date,
          start_at, end_at, duration_seconds, project_id, task, description,
          billable, hourly_rate, currency
        )
        values (
          ('50000000-0000-4000-8000-' || lpad(to_hex(entry_number), 12, '0'))::uuid,
          v_workspace_id, current_user_id, work_date, start_one, end_one, work_date,
          (work_date + start_one) at time zone 'America/Sao_Paulo',
          (work_date + end_one) at time zone 'America/Sao_Paulo',
          extract(epoch from end_one - start_one)::integer, project_one, task_one,
          description_one, billable_one,
          case user_index when 1 then 180 when 2 then 140 else 95 end, 'BRL'
        );
        entry_number := entry_number + 1;

        insert into public.time_entries (
          id, workspace_id, user_id, date, start_time, end_time, end_date,
          start_at, end_at, duration_seconds, project_id, task, description,
          billable, hourly_rate, currency
        )
        values (
          ('50000000-0000-4000-8000-' || lpad(to_hex(entry_number), 12, '0'))::uuid,
          v_workspace_id, current_user_id, work_date, start_two, end_two, work_date,
          (work_date + start_two) at time zone 'America/Sao_Paulo',
          (work_date + end_two) at time zone 'America/Sao_Paulo',
          extract(epoch from end_two - start_two)::integer, project_two, task_two,
          description_two, billable_two,
          case user_index when 1 then 180 when 2 then 140 else 95 end, 'BRL'
        );
        entry_number := entry_number + 1;
      end loop;
    end if;
    work_date := work_date + 1;
  end loop;

  insert into public.workspace_invitations (
    id, workspace_id, email, role, invited_by, status, invited_at, expires_at
  )
  values (
    '40000000-0000-4000-8000-000000000001', v_workspace_id,
    'camila@aurorastudio.example', 'Member', owner_id, 'pending',
    timestamptz '2026-08-25 12:00:00+00', timestamptz '2026-09-01 02:59:59+00'
  );

  insert into public.active_timers (
    user_id, workspace_id, status, task, project_id, billable,
    started_at, started_date, accumulated_seconds, start_clock, hourly_rate, currency
  )
  values (
    member_id, v_workspace_id, 'paused', 'Revisão de acessibilidade',
    '30000000-0000-4000-8000-000000000001', true, null, date '2026-08-31',
    2700, time '16:15', 95, 'BRL'
  );
end;
$$;
