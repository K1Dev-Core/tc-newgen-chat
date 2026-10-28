-- Persist one shared Excalidraw scene per server.
create table if not exists public.server_boards (
  server_id uuid primary key references public.servers (id) on delete cascade,
  scene jsonb not null default '{"type":"excalidraw","version":2,"source":"tc-newgen-chat","elements":[],"appState":{},"files":{}}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.server_boards (server_id)
select id from public.servers
on conflict (server_id) do nothing;

create or replace function public.create_server_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.server_boards (server_id)
  values (new.id)
  on conflict (server_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_server_created_create_board on public.servers;
create trigger on_server_created_create_board
  after insert on public.servers
  for each row execute function public.create_server_board();

alter table public.server_boards enable row level security;
grant select on public.server_boards to anon, authenticated;
grant insert (server_id, scene, updated_by, updated_at) on public.server_boards to authenticated;
grant update (scene, updated_by, updated_at) on public.server_boards to authenticated;

drop policy if exists "Public can read server boards" on public.server_boards;
create policy "Public can read server boards"
  on public.server_boards for select to anon, authenticated using (true);

drop policy if exists "Named users can create server boards" on public.server_boards;
create policy "Named users can create server boards"
  on public.server_boards for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.display_name <> 'Guest'
    )
  );

drop policy if exists "Named users can update server boards" on public.server_boards;
create policy "Named users can update server boards"
  on public.server_boards for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.display_name <> 'Guest'
  ))
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.display_name <> 'Guest'
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'server_boards'
  ) then
    alter publication supabase_realtime add table public.server_boards;
  end if;
end;
$$;
