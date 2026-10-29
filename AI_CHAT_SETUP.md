# Shared room AI setup

The AI works inside every regular chat room. A message is sent normally, and only a message containing `@ai` followed by a prompt is added to the shared AI queue. Everyone in that room sees the prompt and streamed answer in the room. Requests are globally queued and processed one at a time; ordinary messages are never sent to the AI. The ThaiLLM key is only read by the Next.js server.

## 1. Apply the Supabase migration

Open the Supabase SQL Editor for the chat project and run migrations in order if this project has not already been set up:

1. `supabase/migrations/20261029160000_shared_ai_chat.sql`
2. `supabase/migrations/20261029180000_shared_ai_chat_streaming.sql`
3. `supabase/migrations/20261029200000_ai_in_every_chat_room.sql`

The latest migration adds room association, removes the one-job-only restriction, and changes the worker to claim the oldest queued request. It also creates the `enqueue_room_ai_job` RPC used by `@ai` messages.

## 2. Add server environment variables

Set these for local development in `.env.local` and for Production in Vercel Project Settings → Environment Variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
THAILLM_API_KEY=your-full-thaillm-api-key
```

Use the full API key from ThaiLLM Playground. Never add either value to a `NEXT_PUBLIC_` variable, commit them, or paste them into a public repository. The service role key is available in Supabase Project Settings → API Keys and stays server-side.

The integration calls `https://thaillm.or.th/api/v1/chat/completions` with model `openthaigpt-thaillm-8b-instruct-v7.2`. After setting Production variables, redeploy the Vercel project.

## Queue behavior

Signed-in named members can submit prompts in any room. While a request is queued or running, everyone in that room sees its status; the composer remains available so people can continue chatting or add another `@ai` request to the queue. Answers stream into the same room. A failed request releases the queue and displays a short error to that room.
