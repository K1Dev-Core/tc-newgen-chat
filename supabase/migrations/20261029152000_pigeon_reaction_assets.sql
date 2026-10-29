-- Allow the pigeon sticker identifiers stored by the chat Reaction picker.
alter table public.message_reactions
  drop constraint if exists message_reactions_emoji_check;

alter table public.message_reactions
  add constraint message_reactions_emoji_check
  check (emoji in (
    '👍', '❤️', '😂', '😮', '🙏',
    'pigeon-love',
    'pigeon-rude',
    'pigeon-laugh',
    'pigeon-surprised',
    'pigeon-crying',
    'pigeon-wave'
  ));
