-- Let members invoke the shared AI from any normal room. Requests remain
-- globally serialized, and a worker invocation always claims the oldest job.
alter table public.ai_chat_jobs
  add column if not exists room_id uuid references public.chat_rooms (id) on delete cascade;

drop index if exists public.ai_chat_one_active_job_idx;
create index if not exists ai_chat_jobs_queue_idx
  on public.ai_chat_jobs (status, created_at, id)
  where status = 'queued';

create or replace function public.enqueue_room_ai_job(p_room_id uuid, p_prompt text)
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
  if p_room_id is null or not exists (select 1 from public.chat_rooms r where r.id = p_room_id) then
    raise exception 'Chat room not found';
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

  insert into public.ai_chat_jobs (requester_id, requester_name, prompt, room_id)
  values (v_user_id, v_name, btrim(p_prompt), p_room_id)
  returning id into v_job_id;

  insert into public.ai_chat_messages (job_id, role, sender_id, sender_name, content)
  values (v_job_id, 'user', v_user_id, v_name, btrim(p_prompt));

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_room_ai_job(uuid, text) from public, anon;
grant execute on function public.enqueue_room_ai_job(uuid, text) to authenticated;

drop function if exists public.claim_ai_chat_job(uuid);
create function public.claim_ai_chat_job(p_job_id uuid)
returns table (job_id uuid, requester_name text, prompt text, room_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_job_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('tc-newgen-ai-chat-worker'));
  if exists (select 1 from public.ai_chat_jobs j where j.status = 'running') then
    return;
  end if;

  select j.id into v_next_job_id
  from public.ai_chat_jobs j
  where j.status = 'queued'
  order by j.created_at, j.id
  limit 1
  for update;

  if v_next_job_id is null then return; end if;

  return query
  update public.ai_chat_jobs j
     set status = 'running', started_at = now(), error_message = null
   where j.id = v_next_job_id and j.status = 'queued'
  returning j.id, j.requester_name, j.prompt, j.room_id;
end;
$$;

revoke all on function public.claim_ai_chat_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_chat_job(uuid) to service_role;
