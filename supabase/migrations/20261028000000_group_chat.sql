-- Single public-read group room. Visitors can read; named anonymous-auth users can send.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Guest' check (char_length(btrim(display_name)) between 1 and 32),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.servers (id, name)
values ('00000000-0000-4000-8000-000000000010', 'TC')
on conflict (name) do nothing;

insert into public.chat_rooms (id, server_id, slug, name)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000010',
  'nok-phirab-sue-sarn',
  'นกพิราบสื่อสาร'
)
on conflict (slug) do update set name = excluded.name;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  sender_name text not null check (char_length(btrim(sender_name)) between 1 and 32),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created_idx on public.messages (room_id, created_at desc);

create or replace function public.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Guest')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_auth_user();

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.messages enable row level security;

grant select on public.profiles, public.servers, public.chat_rooms, public.messages to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert on public.messages to authenticated;

drop policy if exists "Public can read chat profiles" on public.profiles;
create policy "Public can read chat profiles"
  on public.profiles for select to anon, authenticated using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and char_length(btrim(display_name)) between 1 and 32
  );

drop policy if exists "Public can read chat rooms" on public.chat_rooms;
create policy "Public can read chat rooms"
  on public.chat_rooms for select to anon, authenticated using (true);

drop policy if exists "Public can read chat servers" on public.servers;
create policy "Public can read chat servers"
  on public.servers for select to anon, authenticated using (true);

drop policy if exists "Public can read chat messages" on public.messages;
create policy "Public can read chat messages"
  on public.messages for select to anon, authenticated using (true);

drop policy if exists "Named users can send as themselves" on public.messages;
create policy "Named users can send as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.display_name = sender_name
        and p.display_name <> 'Guest'
    )
  );

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
