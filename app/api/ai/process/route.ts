import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { stripThinkBlocks } from '@/lib/ai-chat';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ClaimedJob = { job_id: string; requester_name: string; prompt: string };
type HistoryMessage = { role: 'user' | 'assistant'; content: string };
type ThaiLlmStreamChunk = {
  choices?: Array<{ delta?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string };
};

function readText(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text ?? '').join('').trim();
}

function readDelta(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text ?? '').join('');
}

function createThinkFilter() {
  const openTag = '<think>';
  const closeTag = '</think>';
  let pending = '';
  let hidden = false;

  function suffixPrefixLength(value: string, tag: string) {
    const lower = value.toLowerCase();
    const normalizedTag = tag.toLowerCase();
    for (let length = Math.min(lower.length, normalizedTag.length - 1); length > 0; length -= 1) {
      if (lower.endsWith(normalizedTag.slice(0, length))) return length;
    }
    return 0;
  }

  return {
    push(chunk: string) {
      pending += chunk;
      let visible = '';

      while (pending) {
        const lower = pending.toLowerCase();
        if (hidden) {
          const closeIndex = lower.indexOf(closeTag);
          if (closeIndex >= 0) {
            pending = pending.slice(closeIndex + closeTag.length);
            hidden = false;
            continue;
          }
          const keep = suffixPrefixLength(pending, closeTag);
          pending = keep ? pending.slice(-keep) : '';
          break;
        }

        const openIndex = lower.indexOf(openTag);
        if (openIndex >= 0) {
          visible += pending.slice(0, openIndex);
          pending = pending.slice(openIndex + openTag.length);
          hidden = true;
          continue;
        }

        const keep = suffixPrefixLength(pending, openTag);
        visible += keep ? pending.slice(0, -keep) : pending;
        pending = keep ? pending.slice(-keep) : '';
        break;
      }

      return visible.replace(/<\/think\s*>/gi, '');
    },
    finish() {
      const lowerPending = pending.toLowerCase();
      const partialOpenTag = openTag.startsWith(lowerPending);
      const tail = !hidden && !partialOpenTag ? pending : '';
      pending = '';
      return tail.replace(/<\/think\s*>/gi, '');
    },
  };
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
    // A failed claim happens before the normal worker error handler. Mark the
    // queued row as failed so it cannot leave the shared composer locked.
    const { error: recoveryError } = await supabase
      .from('ai_chat_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'เริ่มงาน AI ไม่สำเร็จ ลองส่งคำถามใหม่',
      })
      .eq('id', jobId)
      .eq('status', 'queued');
    if (recoveryError) console.error('[AI chat] Could not release queued request.', recoveryError.message);
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
      ...history.map(({ role, content }) => ({ role, content: role === 'assistant' ? stripThinkBlocks(content) : content })),
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
        stream: true,
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!response.ok) {
      await supabase.rpc('fail_ai_chat_job', { p_job_id: job.job_id, p_error: `AI ตอบกลับไม่สำเร็จ (HTTP ${response.status})` });
      return NextResponse.json({ error: 'AI ตอบกลับไม่สำเร็จ ลองใหม่ได้เมื่อคิวว่าง' }, { status: 502 });
    }

    if (!response.body) throw new Error('AI ไม่ได้เปิดสตรีมคำตอบ');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let pendingChunk = '';
    let lastFlushAt = Date.now();
    let streamFinished = false;
    const thinkFilter = createThinkFilter();

    const flushChunk = async () => {
      if (!pendingChunk) return;
      const chunk = pendingChunk;
      pendingChunk = '';
      const { data, error } = await supabase.rpc('append_ai_chat_job_chunk', {
        p_job_id: job.job_id,
        p_content: chunk,
      });
      if (error || data === false) throw new Error('อัปเดตข้อความสตรีมไม่สำเร็จ');
      lastFlushAt = Date.now();
    };

    const consumeLine = async (line: string) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        if (payload === '[DONE]') streamFinished = true;
        return;
      }
      let event: ThaiLlmStreamChunk;
      try {
        event = JSON.parse(payload) as ThaiLlmStreamChunk;
      } catch {
        return;
      }
      if (event.error?.message) throw new Error('AI ส่งข้อผิดพลาดระหว่างสตรีม');
      const delta = thinkFilter.push(readDelta(event.choices?.[0]?.delta?.content));
      if (!delta) return;
      answer += delta;
      pendingChunk += delta;
      if (pendingChunk.length >= 96 || Date.now() - lastFlushAt >= 250) await flushChunk();
    };

    while (!streamFinished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) await consumeLine(line);
      if (done) {
        if (buffer) await consumeLine(buffer);
        break;
      }
    }
    const finalVisibleTail = thinkFilter.finish();
    if (finalVisibleTail) {
      answer += finalVisibleTail;
      pendingChunk += finalVisibleTail;
    }
    await flushChunk();
    answer = stripThinkBlocks(readText(answer));
    if (!answer) throw new Error('AI ส่งคำตอบว่างกลับมา');

    const { data: completed, error: completeError } = await supabase.rpc('finish_ai_chat_job', {
      p_job_id: job.job_id,
      p_content: answer.slice(0, 40_000),
    });
    if (completeError || completed === false) throw new Error('บันทึกคำตอบ AI ไม่สำเร็จ');
    return NextResponse.json({ accepted: true, completed: true });
  } catch (error) {
    const safeMessage = error instanceof Error && error.name === 'TimeoutError'
      ? 'AI ใช้เวลาตอบนานเกินไป ลองส่งคำถามใหม่เมื่อคิวว่าง'
      : 'ประมวลผลคำถามไม่สำเร็จ ลองใหม่เมื่อคิวว่าง';
    await supabase.rpc('fail_ai_chat_job', { p_job_id: job.job_id, p_error: safeMessage });
    console.error('[AI chat] Request failed.', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: safeMessage }, { status: 502 });
  }
}
