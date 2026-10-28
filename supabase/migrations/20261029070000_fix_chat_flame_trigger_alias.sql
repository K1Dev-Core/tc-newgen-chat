-- Fix the upsert target reference in the daily flame trigger.
-- PostgreSQL requires the INSERT target alias (existing) inside ON CONFLICT.
create or replace function public.update_daily_chat_flame()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_day date := (new.created_at at time zone 'Asia/Bangkok')::date;
begin
  insert into public.chat_flames as existing (
    room_id, flame_count, last_fueled_date, today_fueled_by,
    today_fueled_name, last_message_at, updated_at
  ) values (
    new.room_id, 1, local_day, new.sender_id,
    new.sender_name, new.created_at, now()
  )
  on conflict (room_id) do update set
    flame_count = case
      when excluded.last_fueled_date = existing.last_fueled_date
        then existing.flame_count
      when excluded.last_message_at - existing.last_message_at > interval '72 hours'
        then 1
      else existing.flame_count + 1
    end,
    today_fueled_by = case
      when excluded.last_fueled_date > existing.last_fueled_date then excluded.today_fueled_by
      else existing.today_fueled_by
    end,
    today_fueled_name = case
      when excluded.last_fueled_date > existing.last_fueled_date then excluded.today_fueled_name
      else existing.today_fueled_name
    end,
    last_fueled_date = greatest(existing.last_fueled_date, excluded.last_fueled_date),
    last_message_at = greatest(existing.last_message_at, excluded.last_message_at),
    updated_at = now();

  return new;
end;
$$;
