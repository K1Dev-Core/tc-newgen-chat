-- Persist ThaiLLM output incrementally so all room members can watch the stream.
create or replace function public.append_ai_chat_job_chunk(p_job_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_content is null or char_length(p_content) = 0 or octet_length(p_content) > 40000 then
    raise exception 'AI response chunk is empty or too large';
  end if;
  if not exists (select 1 from public.ai_chat_jobs j where j.id = p_job_id and j.status = 'running') then
    return false;
  end if;

  insert into public.ai_chat_messages (job_id, role, sender_name, content)
  values (p_job_id, 'assistant', 'ThaiLLM', p_content)
  on conflict (job_id, role) do update
    set content = public.ai_chat_messages.content || excluded.content;
  return true;
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
  values (p_job_id, 'assistant', 'ThaiLLM', btrim(p_content))
  on conflict (job_id, role) do update set content = excluded.content;
  return true;
end;
$$;

revoke all on function public.append_ai_chat_job_chunk(uuid, text) from public, anon, authenticated;
grant execute on function public.append_ai_chat_job_chunk(uuid, text) to service_role;
