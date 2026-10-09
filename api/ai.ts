/* NEXORA REALITY — AI gateway (Vercel serverless, Node runtime).
   Keys live ONLY in server env vars (GEMINI_API_KEY, GROQ_API_KEY).
   Automatic failover: tries providers in order, skips client-excluded ones,
   switches on rate limits / quota exhaustion / outages / timeouts,
   bounded retries, no retry loops. Never fabricates a response. */

interface VercelReq {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}
interface VercelRes {
  status: (c: number) => VercelRes;
  json: (o: unknown) => void;
  setHeader: (k: string, v: string) => void;
  write: (c: string) => void;
  end: () => void;
}

export interface WireMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type ClientEvent =
  | { type: 'status'; provider: string; note?: string }
  | { type: 'switched'; from: string; to: string; reason: string }
  | { type: 'token'; text: string }
  | { type: 'done'; provider: string }
  | { type: 'error'; code: string; message: string; provider?: string };

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const PRIMARY = (process.env.AI_PRIMARY_PROVIDER || 'gemini').toLowerCase();
const TIMEOUT_MS = 45_000;

interface AttemptResult {
  ok: boolean;
  failover?: boolean; // error is recoverable → try next provider
  code?: string;
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function providerOrder(exclude: string[]): string[] {
  const available: string[] = [];
  if (process.env.GEMINI_API_KEY) available.push('gemini');
  if (process.env.GROQ_API_KEY) available.push('groq');
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  const rest = available.filter((p) => p !== PRIMARY && !ex.has(p));
  const head = available.includes(PRIMARY) && !ex.has(PRIMARY) ? [PRIMARY] : [];
  // If primary was excluded but others failed, allow primary as last resort? No —
  // respect the client cooldown so we never loop back immediately.
  return [...head, ...rest];
}

function toGeminiBody(messages: WireMessage[], system?: string) {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const sys = system || messages.find((m) => m.role === 'system')?.content;
  return {
    contents,
    ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
}

function failoverable(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status === 408) return true;
  const t = bodyText.toLowerCase();
  return (
    t.includes('quota') ||
    t.includes('rate limit') ||
    t.includes('overloaded') ||
    t.includes('temporarily unavailable') ||
    t.includes('timeout')
  );
}

async function tryGemini(
  messages: WireMessage[],
  system: string | undefined,
  emit: (e: ClientEvent) => void,
  fetchImpl: typeof fetch,
): Promise<AttemptResult> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(toGeminiBody(messages, system)),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (res.status === 400)
        return { ok: false, code: 'invalid_request', message: 'The request was rejected by the AI provider.' };
      if (res.status === 401 || res.status === 403)
        return { ok: false, code: 'auth_failed', message: 'Gemini authentication failed. The server API key may be invalid.' };
      if (failoverable(res.status, text))
        return { ok: false, failover: true, code: 'provider_unavailable', message: 'Gemini is unavailable right now.' };
      return { ok: false, code: 'upstream_error', message: `Gemini returned an error (${res.status}).` };
    }
    emit({ type: 'status', provider: 'gemini' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sawSafetyBlock = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buf.split('\n\n');
      buf = frames.pop() ?? '';
      for (const f of frames) {
        for (const line of f.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const cand = j.candidates?.[0];
            if (cand?.finishReason === 'SAFETY') sawSafetyBlock = true;
            const parts = cand?.content?.parts ?? [];
            for (const p of parts) {
              if (typeof p.text === 'string' && p.text) emit({ type: 'token', text: p.text });
            }
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
    if (sawSafetyBlock)
      emit({ type: 'token', text: '\n\n*[The provider declined part of this response for safety reasons.]*' });
    emit({ type: 'done', provider: 'gemini' });
    return { ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (aborted) return { ok: false, failover: true, code: 'timeout', message: 'Gemini timed out.' };
    return { ok: false, failover: true, code: 'network_error', message: 'Could not reach Gemini.' };
  } finally {
    clearTimeout(timer);
  }
}

async function tryGroq(
  messages: WireMessage[],
  system: string | undefined,
  emit: (e: ClientEvent) => void,
  fetchImpl: typeof fetch,
): Promise<AttemptResult> {
  const key = process.env.GROQ_API_KEY!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sys = system || messages.find((m) => m.role === 'system')?.content;
    const chat = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    if (sys) chat.unshift({ role: 'system', content: sys });
    const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: chat, stream: true, temperature: 0.7, max_tokens: 2048 }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (res.status === 400)
        return { ok: false, code: 'invalid_request', message: 'The request was rejected by the AI provider.' };
      if (res.status === 401 || res.status === 403)
        return { ok: false, code: 'auth_failed', message: 'Groq authentication failed. The server API key may be invalid.' };
      if (failoverable(res.status, text))
        return { ok: false, failover: true, code: 'provider_unavailable', message: 'Groq is unavailable right now.' };
      return { ok: false, code: 'upstream_error', message: `Groq returned an error (${res.status}).` };
    }
    emit({ type: 'status', provider: 'groq' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buf.split('\n\n');
      buf = frames.pop() ?? '';
      for (const f of frames) {
        for (const line of f.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) emit({ type: 'token', text: delta });
            if (j.choices?.[0]?.finish_reason === 'content_filter')
              emit({ type: 'token', text: '\n\n*[The provider declined part of this response for safety reasons.]*' });
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
    emit({ type: 'done', provider: 'groq' });
    return { ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (aborted) return { ok: false, failover: true, code: 'timeout', message: 'Groq timed out.' };
    return { ok: false, failover: true, code: 'network_error', message: 'Could not reach Groq.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Core orchestration — exported for testing. */
export async function runChat(
  messages: WireMessage[],
  system: string | undefined,
  exclude: string[],
  emit: (e: ClientEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    emit({
      type: 'error',
      code: 'no_providers_configured',
      message:
        'AI is not configured on this deployment yet. Add GEMINI_API_KEY and/or GROQ_API_KEY as server environment variables, then redeploy. All other Nexora features keep working.',
    });
    return;
  }
  const order = providerOrder(exclude);
  if (order.length === 0) {
    emit({
      type: 'error',
      code: 'all_cooling_down',
      message: 'Both AI providers are cooling down after recent failures. Please wait a minute and try again.',
    });
    return;
  }
  let previous: string | null = null;
  let lastError = '';
  for (const provider of order) {
    // one bounded retry per provider on failoverable errors
    for (let attempt = 0; attempt < 2; attempt++) {
      if (previous && previous !== provider) {
        emit({ type: 'switched', from: previous, to: provider, reason: lastError || 'previous provider failed' });
      }
      const result =
        provider === 'gemini'
          ? await tryGemini(messages, system, emit, fetchImpl)
          : await tryGroq(messages, system, emit, fetchImpl);
      if (result.ok) return;
      lastError = result.message ?? 'provider error';
      if (!result.failover) {
        // Non-recoverable for this provider (auth / bad request): try the next provider once, then report honestly.
        previous = provider;
        break;
      }
      if (attempt === 0) await sleep(800); // single bounded backoff before retry
      previous = provider;
    }
  }
  emit({
    type: 'error',
    code: 'all_failed',
    message:
      'Both AI providers failed just now. Your chats, tasks and other features are unaffected — please try again shortly.',
    provider: previous ?? undefined,
  });
}

function getStatus() {
  return {
    ok: true,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    primary: PRIMARY,
    geminiModel: GEMINI_MODEL,
    groqModel: GROQ_MODEL,
  };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'GET') {
    res.status(200).json(getStatus());
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ code: 'method_not_allowed', message: 'Use POST.' });
    return;
  }
  const body = (req.body ?? {}) as { messages?: WireMessage[]; system?: string; exclude?: string[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || messages.length > 60) {
    res.status(400).json({ code: 'invalid_request', message: 'Provide 1–60 messages.' });
    return;
  }
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || m.content.length > 20000) {
      res.status(400).json({ code: 'invalid_request', message: 'A message is too long or malformed.' });
      return;
    }
  }
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((e) => typeof e === 'string').slice(0, 4) : [];

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (e: ClientEvent) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  try {
    await runChat(messages, typeof body.system === 'string' ? body.system : undefined, exclude, send);
  } catch {
    send({ type: 'error', code: 'internal_error', message: 'The AI service hit an unexpected error.' });
  }
  res.end();
}
