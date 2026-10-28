import { createHmac, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const CDN_URL = (process.env.FILE_CDN_URL || 'https://manus.k1god.com').replace(/\/$/, '');
const MAX_UPLOAD_BYTES = Math.max(1, Number.parseInt(process.env.FILE_MAX_UPLOAD_MB || '250', 10) || 250) * 1024 * 1024;

export async function POST(request: NextRequest) {
  const apiKey = process.env.FILE_CDN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: { code: 'UPLOAD_NOT_CONFIGURED', message: 'File uploads are not configured yet' } }, { status: 503 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const bearer = request.headers.get('authorization') || '';
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!supabaseUrl || !supabaseKey || !accessToken) {
    return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: 'Join the chat before uploading a file' } }, { status: 401 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: 'Your chat session expired; rejoin the chat and try again' } }, { status: 401 });
  }

  const origin = request.headers.get('origin');
  const requestHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  try {
    if (!origin || !requestHost || new URL(origin).host !== requestHost) {
      return NextResponse.json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Upload ticket requests must come from this chat site' } }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Invalid request origin' } }, { status: 403 });
  }

  let requestedSize: unknown;
  try { ({ size: requestedSize } = await request.json()); }
  catch { return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Send a JSON body containing the file size' } }, { status: 400 }); }
  if (typeof requestedSize !== 'number' || !Number.isSafeInteger(requestedSize) || requestedSize < 0) {
    return NextResponse.json({ error: { code: 'INVALID_FILE_SIZE', message: 'File size must be a non-negative integer' } }, { status: 400 });
  }
  if (requestedSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: `Maximum upload size is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` } }, { status: 413 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const payload = Buffer.from(JSON.stringify({ scope: 'file:upload', id: randomUUID(), exp: expiresAt, maxBytes: Math.max(1, requestedSize) })).toString('base64url');
  const signature = createHmac('sha256', apiKey).update(payload).digest('base64url');
  return NextResponse.json({ uploadUrl: `${CDN_URL}/v1/files`, token: `${payload}.${signature}`, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
