-- Shared, persistent distance counter for the sidebar pigeon.

create table if not exists public.mascot_run_stats (
  id smallint primary key default 1 check (id = 1),
  total_meters bigint not null default 0 check (total_meters >= 0),
  updated_at timestamptz not null default now()
);

insert into public.mascot_run_stats (id, total_meters)
values (1, 0)
on conflict (id) do nothing;

alter table public.mascot_run_stats enable row level security;
grant select on public.mascot_run_stats to anon, authenticated;

drop policy if exists "Public can read mascot run distance" on public.mascot_run_stats;
create policy "Public can read mascot run distance"
  on public.mascot_run_stats for select to anon, authenticated using (true);

create table if not exists public.mascot_activity_visitors (
  client_id uuid primary key,
  last_flush_at timestamptz not null default '-infinity'::timestamptz
);

alter table public.mascot_activity_visitors enable row level security;
revoke all on public.mascot_activity_visitors from anon, authenticated;

create or replace function public.record_mascot_activity(p_client_id uuid, p_meters integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_flush_at timestamptz;
  v_total_meters bigint;
begin
  if p_client_id is null then
    raise exception 'client id is required';
  end if;
  if p_meters is null or p_meters < 1 or p_meters > 500 then
    raise exception 'activity increment must be between 1 and 500 meters';
  end if;

  insert into public.mascot_activity_visitors (client_id, last_flush_at)
  values (p_client_id, now() - interval '12 seconds')
  on conflict (client_id) do nothing;

  select visitor.last_flush_at
    into v_last_flush_at
    from public.mascot_activity_visitors visitor
    where visitor.client_id = p_client_id
    for update;

  if v_last_flush_at > now() - interval '8 seconds' then
    return -1;
  end if;

  update public.mascot_activity_visitors
    set last_flush_at = now()
    where client_id = p_client_id;

  update public.mascot_run_stats
    set total_meters = total_meters + p_meters,
        updated_at = now()
    where id = 1
    returning total_meters into v_total_meters;

  return v_total_meters;
end;
$$;

revoke all on function public.record_mascot_activity(uuid, integer) from public;
grant execute on function public.record_mascot_activity(uuid, integer) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mascot_run_stats'
  ) then
    alter publication supabase_realtime add table public.mascot_run_stats;
  end if;
end;
$$;
