-- Reply metadata and persistent realtime emoji reactions for group chat.

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

create index if not exists messages_room_reply_idx
  on public.messages (room_id, reply_to_id)
  where reply_to_id is not null;

create or replace function public.enforce_same_room_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1
    from public.messages replied
    where replied.id = new.reply_to_id
      and replied.room_id = new.room_id
  ) then
    raise exception 'reply target must be a message in the same room';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_same_room_reply on public.messages;
create trigger messages_same_room_reply
  before insert or update of reply_to_id, room_id on public.messages
  for each row execute function public.enforce_same_room_message_reply();

create table if not exists public.message_reactions (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_room_message_idx
  on public.message_reactions (room_id, message_id);

create or replace function public.enforce_message_reaction_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages message
    where message.id = new.message_id
      and message.room_id = new.room_id
  ) then
    raise exception 'reaction target must be a message in the same room';
  end if;
  return new;
end;
$$;

drop trigger if exists message_reactions_same_room on public.message_reactions;
create trigger message_reactions_same_room
  before insert or update of message_id, room_id on public.message_reactions
  for each row execute function public.enforce_message_reaction_room();

alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;
grant select on public.message_reactions to anon, authenticated;
grant insert, delete on public.message_reactions to authenticated;

drop policy if exists "Public can read message reactions" on public.message_reactions;
create policy "Public can read message reactions"
  on public.message_reactions for select to anon, authenticated using (true);

drop policy if exists "Named members can react as themselves" on public.message_reactions;
create policy "Named members can react as themselves"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.display_name <> 'Guest'
    )
  );

drop policy if exists "Members can remove their own reactions" on public.message_reactions;
create policy "Members can remove their own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;
