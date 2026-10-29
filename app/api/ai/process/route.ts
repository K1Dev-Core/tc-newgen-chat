import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ClaimedJob = { job_id: string; requester_name: string; prompt: string };
type HistoryMessage = { role: 'user' | 'assistant'; content: string };
type ThaiLlmResponse = { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };

function readText(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text ?? '').join('').trim();
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const thaiLlmApiKey = process.env.THAILLM_API_KEY;
  if (!supabaseUrl || !serviceRoleKey || !thaiLlmApiKey) {
    return NextResponse.json({ error: 'AI service is not configured' }, { status: 503 });
  }

  let jobId: string;
  try {
    const body = await request.json() as { jobId?: unknown };
    jobId = typeof body.jobId === 'string' ? body.jobId : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimData, error: claimError } = await supabase.rpc('claim_ai_chat_job', { p_job_id: jobId });
  if (claimError) {
    console.error('[AI chat] Could not claim request.', claimError.message);
    return NextResponse.json({ error: 'เริ่มงาน AI ไม่สำเร็จ' }, { status: 500 });
  }
  const job = (Array.isArray(claimData) ? claimData[0] : claimData) as ClaimedJob | null;
  if (!job) return NextResponse.json({ accepted: true, alreadyClaimed: true }, { status: 202 });

  try {
    const { data: historyData, error: historyError } = await supabase
      .from('ai_chat_messages')
      .select('role,content')
      .order('created_at', { ascending: false })
      .limit(41);
    if (historyError) throw new Error('โหลดประวัติแชท AI ไม่สำเร็จ');

    const history = ((historyData ?? []) as HistoryMessage[])
      .reverse()
      .filter((message) => message.content.trim())
      .slice(-40);
    const modelMessages = [
      { role: 'system', content: 'คุณคือผู้ช่วย AI ในห้องแชทกลุ่มของเพื่อน ตอบเป็นภาษาเดียวกับผู้ถาม กระชับ ชัดเจน และรักษาบริบทจากข้อความก่อนหน้า หากมีหลายคนใช้ห้องนี้ ให้ตอบเฉพาะคำถามล่าสุดโดยอิงประวัติที่เกี่ยวข้อง' },
      ...history.map(({ role, content }) => ({ role, content })),
    ];

    const response = await fetch('https://thaillm.or.th/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${thaiLlmApiKey}`,
      },
      body: JSON.stringify({
        model: 'openthaigpt-thaillm-8b-instruct-v7.2',
        messages: modelMessages,
        max_tokens: 2048,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!response.ok) {
      await supabase.rpc('fail_ai_chat_job', { p_job_id: job.job_id, p_error: `ThaiLLM ตอบกลับไม่สำเร็จ (HTTP ${response.status})` });
      return NextResponse.json({ error: 'ThaiLLM ตอบกลับไม่สำเร็จ ลองใหม่ได้เมื่อคิวว่าง' }, { status: 502 });
    }

    const result = await response.json() as ThaiLlmResponse;
    const answer = readText(result.choices?.[0]?.message?.content);
    if (!answer) throw new Error('ThaiLLM ส่งคำตอบว่างกลับมา');

    const { data: completed, error: completeError } = await supabase.rpc('finish_ai_chat_job', {
      p_job_id: job.job_id,
      p_content: answer.slice(0, 40_000),
    });
    if (completeError || completed === false) throw new Error('บันทึกคำตอบ AI ไม่สำเร็จ');
    return NextResponse.json({ accepted: true, completed: true });
  } catch (error) {
    const safeMessage = error instanceof Error && error.name === 'TimeoutError'
      ? 'ThaiLLM ใช้เวลาตอบนานเกินไป ลองส่งคำถามใหม่เมื่อคิวว่าง'
      : 'ประมวลผลคำถามไม่สำเร็จ ลองใหม่เมื่อคิวว่าง';
    await supabase.rpc('fail_ai_chat_job', { p_job_id: job.job_id, p_error: safeMessage });
    console.error('[AI chat] Request failed.', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: safeMessage }, { status: 502 });
  }
}
