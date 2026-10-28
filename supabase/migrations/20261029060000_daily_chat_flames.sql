-- Track a room's daily flame and the first person who fuels it each day.
-- The inactivity window is measured as 72 elapsed hours in Bangkok-local days.
create table if not exists public.chat_flames (
  room_id uuid primary key references public.chat_rooms (id) on delete cascade,
  flame_count integer not null default 0 check (flame_count >= 0),
  last_fueled_date date,
  today_fueled_by uuid references auth.users (id) on delete set null,
  today_fueled_name text,
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.chat_flames enable row level security;
grant select on public.chat_flames to anon, authenticated;

drop policy if exists "Public can read chat flames" on public.chat_flames;
create policy "Public can read chat flames"
  on public.chat_flames for select to anon, authenticated using (true);

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
      when excluded.last_fueled_date = public.chat_flames.last_fueled_date
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

drop trigger if exists on_message_update_daily_chat_flame on public.messages;
create trigger on_message_update_daily_chat_flame
  after insert on public.messages
  for each row execute function public.update_daily_chat_flame();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_flames'
  ) then
    alter publication supabase_realtime add table public.chat_flames;
  end if;
end;
$$;
