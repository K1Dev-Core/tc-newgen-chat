# Shared ThaiLLM chat setup

The AI channel stores prompts and answers in Supabase so every member sees the same conversation. A database uniqueness rule and a server-side claim function allow only one queued or running request at a time. The ThaiLLM key is only read by the Next.js server.

## 1. Apply the Supabase migration

Open the Supabase SQL Editor for the chat project, paste the contents of `supabase/migrations/20261029160000_shared_ai_chat.sql`, and run it once. This creates the shared transcript and job tables, realtime publication entries, row-level security policies, and the queue functions.

## 2. Add server environment variables

Set these for local development in `.env.local` and for Production in Vercel Project Settings → Environment Variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
THAILLM_API_KEY=your-full-thaillm-api-key
```

Use the full API key from ThaiLLM Playground. Never add either value to a `NEXT_PUBLIC_` variable, commit them, or paste them into a public repository. The service role key is available in Supabase Project Settings → API Keys and stays server-side.

The integration calls `https://thaillm.or.th/api/v1/chat/completions` with model `openthaigpt-thaillm-8b-instruct-v7.2`. After setting Production variables, redeploy the Vercel project.

## Queue behavior

Signed-in named members can submit prompts. While a request is queued or running, everyone sees who is using AI and the composer is disabled. On completion, the answer appears in the shared transcript. A failed request releases the queue and displays a short error to everyone.
