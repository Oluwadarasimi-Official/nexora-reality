import React, { createContext, useCallback, useContext, useEffect, useRef, useState, forwardRef } from 'react';
import { uid } from '../types';

/* ---------- Toasts ---------- */
export interface Toast { id: string; title: string; body?: string; kind: 'ok' | 'err' | 'info'; }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid();
    setToasts((p) => [...p.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,420px)] flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="nr-card flex items-start gap-3 !p-3 animate-fade-up pointer-events-auto">
            <span className="text-lg leading-none mt-0.5" aria-hidden>
              {t.kind === 'ok' ? '✓' : t.kind === 'err' ? '⚠' : 'ℹ'}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.body && <div className="text-xs opacity-70 mt-0.5 break-words">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Buttons / inputs ---------- */
export const Btn = ({ className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`nr-btn ${className}`} />
);
export const GhostBtn = ({ className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`nr-btn-ghost ${className}`} />
);
export const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...p }, ref) => <input ref={ref} {...p} className={`nr-input ${className}`} />
);
Field.displayName = 'Field';
export const Area = ({ className = '', ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={`nr-input ${className}`} />
);
export const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="nr-label">{children}</label>
);

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} className={`relative nr-glass w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[88vh] overflow-y-auto nr-scroll rounded-t-3xl sm:rounded-3xl p-5 animate-fade-up`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full nr-btn-ghost !p-0 !px-0">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Confirm ---------- */
export function useConfirm() {
  const [state, setState] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((msg: string) => new Promise<boolean>((resolve) => setState({ msg, resolve })), []);
  const ui = state ? (
    <Modal title="Are you sure?" onClose={() => { state.resolve(false); setState(null); }}>
      <p className="text-sm opacity-80 mb-5">{state.msg}</p>
      <div className="flex gap-3 justify-end">
        <GhostBtn onClick={() => { state.resolve(false); setState(null); }}>Cancel</GhostBtn>
        <Btn onClick={() => { state.resolve(true); setState(null); }}>Confirm</Btn>
      </div>
    </Modal>
  ) : null;
  return { ask, ui };
}

/* ---------- Empty state ---------- */
export function Empty({ icon, title, body, action }: {
  icon: string; title: string; body?: string; action?: React.ReactNode;
}) {
  return (
    <div className="nr-card flex flex-col items-center text-center py-10 px-6">
      <div className="text-4xl mb-3 opacity-80" aria-hidden>{icon}</div>
      <div className="font-bold mb-1">{title}</div>
      {body && <p className="text-sm opacity-60 max-w-xs mb-4">{body}</p>}
      {action}
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="nr-skeleton h-16" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? '22px' : '2px' }} />
    </button>
  );
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl p-1 gap-1 nr-glass !p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === o.value ? 'text-black' : 'opacity-60'}`}
          style={value === o.value ? { background: 'var(--accent)' } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
      {right && <div className="flex gap-2 shrink-0">{right}</div>}
    </div>
  );
}

/* ---------- Progress ring ---------- */
export function Ring({ pct, size = 56, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} />
      </svg>
      <span className="absolute text-xs font-bold">{label ?? `${Math.round(pct * 100)}%`}</span>
    </div>
  );
}

/* ---------- Demo badge ---------- */
export const DemoBadge = () => (
  <span className="nr-chip !py-0.5" title="Sample data you can delete">DEMO</span>
);

/* ---------- Relative time ---------- */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

/* ---------- Safe markdown-lite renderer ---------- */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(src: string): string {
  // Escape first, then apply minimal markdown. Code blocks handled with placeholders.
  const codeBlocks: string[] = [];
  let html = escapeHtml(src);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${code}</code></pre>`);
    return `\u0000${codeBlocks.length - 1}\u0000`;
  });
  html = html
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h\d|ul|pre|blockquote)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);
  return html;
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`nr-md text-sm leading-relaxed ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
