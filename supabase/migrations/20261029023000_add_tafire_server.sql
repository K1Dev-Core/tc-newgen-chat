-- Add the Tafire server with its first room.
insert into public.servers (name)
values ('Tafire')
on conflict (name) do nothing;

insert into public.chat_rooms (server_id, slug, name)
select id, 'tafire-talk', 'พูดคุย'
from public.servers
where name = 'Tafire'
on conflict (slug) do update
set server_id = excluded.server_id,
    name = excluded.name;
