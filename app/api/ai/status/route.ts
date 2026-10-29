import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.THAILLM_API_KEY,
  );
  return NextResponse.json({ configured });
}
