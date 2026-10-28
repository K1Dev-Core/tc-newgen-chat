-- Allow larger formatted snippets while keeping Realtime payloads below 256 KB.
alter table public.messages
  drop constraint if exists messages_content_check;

alter table public.messages
  drop constraint if exists messages_content_length_check;

alter table public.messages
  add constraint messages_content_length_check
  check (char_length(btrim(content)) > 0 and octet_length(content) <= 180000);
