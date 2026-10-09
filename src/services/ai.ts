/* AI client — talks only to our own serverless endpoint (/api/ai).
   Keys never touch the browser. Failover is automatic: the client keeps a
   short cooldown list of recently-failed providers and asks the server to
   skip them; the server tries the rest in order and reports what it used. */

export interface AIWireMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIStatus {
  ok: boolean;
  gemini: boolean;
  groq: boolean;
  primary: string;
  geminiModel?: string;
  groqModel?: string;
  note?: string;
}

export type StreamEvent =
  | { type: 'status'; provider: string; note?: string }
  | { type: 'switched'; from: string; to: string; reason: string }
  | { type: 'token'; text: string }
  | { type: 'done'; provider: string }
  | { type: 'error'; code: string; message: string };

const COOLDOWN_MS = 90_000; // don't retry a failed provider for 90s
const failedAt = new Map<string, number>();

function excludedProviders(): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (const [p, t] of failedAt) {
    if (now - t < COOLDOWN_MS) out.push(p);
    else failedAt.delete(p);
  }
  return out;
}

export function markProviderFailed(p: string) {
  failedAt.set(p, Date.now());
}

export async function aiStatus(): Promise<AIStatus> {
  try {
    const r = await fetch('/api/ai', { cache: 'no-store' });
    if (!r.ok) return { ok: false, gemini: false, groq: false, primary: 'none' };
    return (await r.json()) as AIStatus;
  } catch {
    return { ok: false, gemini: false, groq: false, primary: 'none', note: 'offline' };
  }
}

export interface ChatOpts {
  messages: AIWireMessage[];
  system?: string;
  exclude?: string[];
  signal?: AbortSignal;
  onEvent: (e: StreamEvent) => void;
}

/** Streams a chat completion. Resolves when done, throws on transport failure. */
export async function streamChat(opts: ChatOpts): Promise<void> {
  const exclude = [...excludedProviders(), ...(opts.exclude ?? [])];
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({ messages: opts.messages, system: opts.system, exclude }),
  });

  if (!res.ok || !res.body) {
    let code = 'transport_error';
    let message = 'Could not reach the AI service.';
    try {
      const j = await res.json();
      code = j.code ?? code;
      message = j.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    opts.onEvent({ type: 'error', code, message });
    return;
  }

  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('text/event-stream')) {
    // Static hosts without the serverless function return HTML here.
    opts.onEvent({
      type: 'error',
      code: 'no_providers_configured',
      message: 'AI is not configured on this deployment yet. Add GEMINI_API_KEY and/or GROQ_API_KEY as server environment variables, then redeploy.',
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const emit = (raw: string) => {
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const e = JSON.parse(payload) as StreamEvent;
        if (e.type === 'error' && (e as { provider?: string }).provider) {
          markProviderFailed((e as { provider?: string }).provider!);
        }
        opts.onEvent(e);
      } catch {
        /* ignore malformed frames */
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) emit(p);
  }
  if (buf.trim()) emit(buf);
}

export function buildSystemPrompt(ctx: {
  name?: string;
  tasksDue?: number;
  activeProjects?: string[];
  focusTodayMin?: number;
}): string {
  const lines = [
    'You are the AI Commander inside NEXORA REALITY, a personal digital universe.',
    'Help with coding, studying, writing, planning, summarising, brainstorming and project management.',
    'Be concise on mobile. Use short sections and simple formatting.',
    'If you propose an important change (deleting data, sending anything, changing settings), say you need approval first — never act on it yourself.',
  ];
  if (ctx.name) lines.push(`The user's name is ${ctx.name}.`);
  if (ctx.tasksDue) lines.push(`They have ${ctx.tasksDue} tasks due today or overdue.`);
  if (ctx.activeProjects?.length) lines.push(`Active projects: ${ctx.activeProjects.join(', ')}.`);
  if (ctx.focusTodayMin) lines.push(`Focus time today: ${ctx.focusTodayMin} minutes.`);
  return lines.join('\n');
}
