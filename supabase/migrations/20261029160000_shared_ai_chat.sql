-- Shared ThaiLLM chat with a single globally active request.
create table if not exists public.ai_chat_jobs (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  requester_name text not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 6000 and octet_length(prompt) <= 24000),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index if not exists ai_chat_one_active_job_idx
  on public.ai_chat_jobs ((true))
  where status in ('queued', 'running');

create index if not exists ai_chat_jobs_created_idx
  on public.ai_chat_jobs (created_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_chat_jobs (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  sender_id uuid references auth.users (id) on delete set null,
  sender_name text not null,
  content text not null check (char_length(btrim(content)) > 0 and octet_length(content) <= 40000),
  created_at timestamptz not null default now(),
  unique (job_id, role)
);

create index if not exists ai_chat_messages_created_idx
  on public.ai_chat_messages (created_at asc, id asc);

alter table public.ai_chat_jobs enable row level security;
alter table public.ai_chat_messages enable row level security;

revoke all on public.ai_chat_jobs from anon, authenticated;
revoke all on public.ai_chat_messages from anon, authenticated;
grant select on public.ai_chat_jobs, public.ai_chat_messages to anon, authenticated;

drop policy if exists "Everyone can read shared AI jobs" on public.ai_chat_jobs;
create policy "Everyone can read shared AI jobs"
  on public.ai_chat_jobs for select to anon, authenticated using (true);

drop policy if exists "Everyone can read shared AI messages" on public.ai_chat_messages;
create policy "Everyone can read shared AI messages"
  on public.ai_chat_messages for select to anon, authenticated using (true);

create or replace function public.enqueue_ai_chat_job(p_prompt text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'Join the chat before asking AI';
  end if;
  if p_prompt is null or char_length(btrim(p_prompt)) not between 1 and 6000 or octet_length(p_prompt) > 24000 then
    raise exception 'Prompt must be between 1 and 6000 characters';
  end if;

  select p.display_name into v_name
  from public.profiles p
  where p.id = v_user_id and p.display_name <> 'Guest';
  if v_name is null then
    raise exception 'Set a display name before asking AI';
  end if;

  insert into public.ai_chat_jobs (requester_id, requester_name, prompt)
  values (v_user_id, v_name, btrim(p_prompt))
  returning id into v_job_id;

  insert into public.ai_chat_messages (job_id, role, sender_id, sender_name, content)
  values (v_job_id, 'user', v_user_id, v_name, btrim(p_prompt));

  return v_job_id;
exception
  when unique_violation then
    raise exception 'AI is busy; wait for the current request to finish';
end;
$$;

revoke all on function public.enqueue_ai_chat_job(text) from public, anon;
grant execute on function public.enqueue_ai_chat_job(text) to authenticated;

create or replace function public.claim_ai_chat_job(p_job_id uuid)
returns table (job_id uuid, requester_name text, prompt text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('tc-newgen-ai-chat-worker'));
  if exists (select 1 from public.ai_chat_jobs j where j.status = 'running') then
    return;
  end if;

  return query
  update public.ai_chat_jobs j
     set status = 'running', started_at = now(), error_message = null
   where j.id = p_job_id and j.status = 'queued'
  returning j.id, j.requester_name, j.prompt;
end;
$$;

create or replace function public.finish_ai_chat_job(p_job_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_content is null or char_length(btrim(p_content)) = 0 or octet_length(p_content) > 40000 then
    raise exception 'AI response is empty or too large';
  end if;

  update public.ai_chat_jobs j
     set status = 'completed', finished_at = now(), error_message = null
   where j.id = p_job_id and j.status = 'running'
  returning j.requester_name into v_requester_name;
  if v_requester_name is null then return false; end if;

  insert into public.ai_chat_messages (job_id, role, sender_name, content)
  values (p_job_id, 'assistant', 'ThaiLLM', btrim(p_content));
  return true;
end;
$$;

create or replace function public.fail_ai_chat_job(p_job_id uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  update public.ai_chat_jobs j
     set status = 'failed', finished_at = now(), error_message = left(coalesce(p_error, 'AI request failed'), 240)
   where j.id = p_job_id and j.status = 'running';
  return found;
end;
$$;

revoke all on function public.claim_ai_chat_job(uuid) from public, anon, authenticated;
revoke all on function public.finish_ai_chat_job(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_ai_chat_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_chat_job(uuid) to service_role;
grant execute on function public.finish_ai_chat_job(uuid, text) to service_role;
grant execute on function public.fail_ai_chat_job(uuid, text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_chat_jobs'
  ) then
    alter publication supabase_realtime add table public.ai_chat_jobs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_chat_messages'
  ) then
    alter publication supabase_realtime add table public.ai_chat_messages;
  end if;
end;
$$;
