# ทีซี นิวเจน — Group Chat

Next.js 16 group chat using Supabase Auth, Postgres, and Realtime. Visitors can read the single public room. To send, a person enters a display name; the app silently creates a Supabase anonymous session, so there is no email/password login screen.

## Supabase setup

1. Create a Supabase project.
2. In **Authentication → Sign In / Providers**, enable **Allow anonymous sign-ins**. The app only asks people for a display name.
3. Run all SQL files in `supabase/migrations` in filename order in the Supabase SQL Editor. The migrations create `profiles`, `servers`, `chat_rooms`, and `messages`, seed `TC / นกพิราบสื่อสาร`, enable RLS, publish chat messages and member profile changes to Realtime, raise the message byte limit for code snippets, add persistent message reactions and reply references, and add the shared pigeon distance counter.
4. Copy `.env.example` to `.env.local` and set the project's URL and publishable key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

5. Restart Next.js with `npm run dev`.

The publishable key is intended for browser use; do not put a `service_role` or secret key in `NEXT_PUBLIC_*` variables. RLS allows public read-only access and restricts message inserts to the sender's own authenticated anonymous session and saved display name.

## Run locally

```bash
npm install
npm run dev
```

## How chat works

- No name: the room is readable, but the message box is disabled.
- Enter a name: Supabase creates an anonymous session in the background; the profile name is saved and the sender can post.
- Messages are stored in Postgres and delivered to open clients using Supabase Realtime Postgres Changes.
- Search checks the current room's full message history by message text or sender name; selecting a result loads and scrolls to the original message.
- Members can add or remove emoji reactions; counts and selections sync through Supabase Realtime. Visitors can see reactions but must join to add one.
- Replies store a reference to the original message and show a preview above the composer and with the sent message. Reply references stay within the same room.
- The sidebar pigeon counts shared distance from cursor movement, trusted clicks, typed characters, and successful sent messages. Each browser batches increments every 10 seconds; Supabase rate-limits each browser's counter updates and broadcasts the long-term total to everyone.
- Profile names and avatar URLs are stored in `profiles`; profile edits are sent to every open client through Supabase Realtime. The picker reads the public catalog from `https://profile-image-cdn.vercel.app/api/profiles`.
- A temporary Realtime Broadcast indicator shows who is typing; it lists up to three names and switches to a group indicator for four or more people.
- Messages support fenced code blocks with language hints or automatic language detection, syntax highlighting, copy controls, and expand/collapse for long snippets. Use the composer’s **โค้ด** button to wrap pasted code before sending.
- Profile image URLs can be added to `profiles.avatar_url` later and can point to the separate profile image CDN project.

This room is intentionally public-read to support visitors without login. Display names are not verified, and a user can choose a name already used by someone else. Do not use this setup for private conversations or sensitive data.

## Validation

```bash
npm run typecheck
npm run build
```

Realtime configuration is external to the repository. Add the Supabase URL and publishable key to local `.env.local` and the Vercel project's environment variables before using the live chat.
