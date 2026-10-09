import React, { useEffect, useMemo, useState } from 'react';
import { StudioPage, uid } from '../types';
import { Area, Btn, DemoBadge, Empty, Field, GhostBtn, Label, Modal, PageHead, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';
import { streamChat } from '../services/ai';

const TEMPLATES: { id: string; name: string; html: string; css: string; js: string }[] = [
  {
    id: 'landing', name: 'Landing page',
    html: `<header class="hero">\n  <h1>Your Product</h1>\n  <p>One line that makes people care.</p>\n  <button onclick="cta()">Get started</button>\n</header>\n<section class="features">\n  <div>⚡ Fast</div><div>🔒 Secure</div><div>✦ Beautiful</div>\n</section>`,
    css: `body{font-family:system-ui;margin:0;background:#06121f;color:#eaf6f0}\n.hero{padding:72px 24px;text-align:center}\n.hero h1{font-size:2.4rem;margin:0 0 8px}\n.hero p{opacity:.7;margin:0 0 20px}\nbutton{padding:12px 28px;border:0;border-radius:12px;background:#10b981;font-weight:700;cursor:pointer}\n.features{display:flex;gap:12px;justify-content:center;padding:24px;flex-wrap:wrap}\n.features div{background:#0a1a2e;padding:16px 20px;border-radius:12px}`,
    js: `function cta(){ alert('Thanks for your interest!'); }`,
  },
  {
    id: 'portfolio', name: 'Portfolio',
    html: `<header>\n  <h1>Your Name</h1>\n  <p>Web Developer & Designer</p>\n</header>\n<main id="work">\n  <article><h3>Project One</h3><p>What you built and why it matters.</p></article>\n  <article><h3>Project Two</h3><p>What you built and why it matters.</p></article>\n</main>`,
    css: `body{font-family:system-ui;margin:0;background:#f2f7f4;color:#0b1f17;padding:24px}\nheader{text-align:center;margin-bottom:32px}\n#work{display:grid;gap:16px;max-width:560px;margin:0 auto}\narticle{background:#fff;border-radius:14px;padding:20px;box-shadow:0 4px 14px rgba(0,0,0,.08)}`,
    js: `// Add interactivity here\nconsole.log('Portfolio loaded');`,
  },
  {
    id: 'bio', name: 'Link-in-bio',
    html: `<div class="card">\n  <div class="avatar">✦</div>\n  <h1>@you</h1>\n  <p>Everything I make, in one place.</p>\n  <a href="#">My portfolio</a>\n  <a href="#">WhatsApp me</a>\n  <a href="#">GitHub</a>\n</div>`,
    css: `body{font-family:system-ui;margin:0;min-height:100vh;display:flex;justify-content:center;background:linear-gradient(160deg,#06121f,#0a2a1f);color:#eaf6f0;padding:32px 16px}\n.card{width:100%;max-width:360px;text-align:center}\n.avatar{width:72px;height:72px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px}\na{display:block;background:rgba(255,255,255,.08);color:#eaf6f0;text-decoration:none;padding:14px;border-radius:14px;margin:10px 0;border:1px solid rgba(255,255,255,.12)}`,
    js: ``,
  },
];

type Tab = 'html' | 'css' | 'js';

export default function Studio() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [pages, setPages] = useState<StudioPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('html');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const refresh = async () => {
    const p = await idb.all<StudioPage>('studioPages');
    p.sort((a, b) => b.updatedAt - a.updatedAt);
    setPages(p);
    if (!activeId && p.length > 0) setActiveId(p[0].id);
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const active = pages.find((p) => p.id === activeId) ?? null;

  const update = async (patch: Partial<StudioPage>) => {
    if (!active) return;
    const next = { ...active, ...patch, updatedAt: Date.now() };
    await idb.put('studioPages', next);
    setPages((ps) => ps.map((p) => (p.id === next.id ? next : p)));
  };

  const newPage = async (tpl?: typeof TEMPLATES[number]) => {
    const p: StudioPage = {
      id: uid(), name: tpl ? `${tpl.name} — ${new Date().toLocaleDateString()}` : 'Untitled page',
      html: tpl?.html ?? '<h1>Hello</h1>\n<p>Start building.</p>',
      css: tpl?.css ?? 'body{font-family:system-ui;padding:24px}',
      js: tpl?.js ?? '', template: tpl?.id ?? 'blank', updatedAt: Date.now(),
    };
    await idb.put('studioPages', p);
    await logActivity('studio', `Created page: ${p.name}`);
    setPages((ps) => [p, ...ps]);
    setActiveId(p.id);
    setShowTemplates(false);
    toast({ kind: 'ok', title: 'Page created' });
  };

  const remove = async (p: StudioPage) => {
    if (!(await ask(`Delete "${p.name}"?`))) return;
    await idb.del('studioPages', p.id);
    setPages((ps) => ps.filter((x) => x.id !== p.id));
    if (activeId === p.id) setActiveId(null);
    setShowPages(false);
    toast({ kind: 'ok', title: 'Page deleted' });
  };

  const exportHtml = () => {
    if (!active) return;
    const doc = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${active.name}</title>\n<style>\n${active.css}\n</style>\n</head>\n<body>\n${active.html}\n<script>\n${active.js}\n</script>\n</body>\n</html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast({ kind: 'ok', title: 'Exported as HTML' });
  };

  const generateWithAI = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    let out = '';
    try {
      await streamChat({
        messages: [{ role: 'user', content: prompt }],
        system: `You generate a complete tiny single-page website. Reply with ONLY three fenced code blocks in this exact order, no other text:\n\`\`\`html\n(the body HTML)\n\`\`\`\n\`\`\`css\n(the CSS)\n\`\`\`\n\`\`\`js\n(the JavaScript, or empty)\n\`\`\`\nKeep it mobile-first, under 120 lines total, no external resources.`,
        onEvent: (e) => { if (e.type === 'token') out += e.text; if (e.type === 'error' && !out) toast({ kind: 'err', title: 'AI generation failed', body: e.message }); },
      });
    } finally { setAiBusy(false); }
    const grab = (lang: string) => {
      const m = out.match(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'i'));
      return m ? m[1].trim() : '';
    };
    const html = grab('html'), css = grab('css'), js = grab('js');
    if (!html && !css) { if (out) toast({ kind: 'err', title: 'Could not parse AI output', body: 'Try a simpler prompt.' }); return; }
    const p: StudioPage = {
      id: uid(), name: prompt.slice(0, 40), html: html || '<h1>Generated</h1>', css: css || '', js,
      template: 'ai', updatedAt: Date.now(),
    };
    await idb.put('studioPages', p);
    await logActivity('studio', `AI-generated page: ${p.name}`);
    setPages((ps) => [p, ...ps]);
    setActiveId(p.id);
    setAiPrompt('');
    toast({ kind: 'ok', title: 'Page generated ✦' });
  };

  const srcDoc = useMemo(() => {
    if (!active) return '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${active.css}</style></head><body>${active.html}<script>${active.js}<\/script></body></html>`;
  }, [active]);

  const editorVal = active ? active[tab] : '';

  return (
    <div className="animate-fade-up">
      <PageHead title="Studio" sub="Build tiny websites · sandboxed preview"
        right={
          <>
            <GhostBtn className="!px-3 !py-2 !text-xs" onClick={() => setShowPages(true)}>☰ Pages</GhostBtn>
            <Btn className="!px-3 !py-2 !text-xs" onClick={() => setShowTemplates(true)}>＋ New</Btn>
          </>
        } />

      {!active ? (
        <Empty icon="◈" title="No pages yet" body="Start from a template or describe a site and let AI build it."
          action={<Btn className="!text-xs" onClick={() => setShowTemplates(true)}>＋ New page</Btn>} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Field value={active.name} onChange={(e) => update({ name: e.target.value })} aria-label="Page name" className="!py-2" maxLength={60} />
            {active.demo && <DemoBadge />}
            <GhostBtn className="!px-3 !py-2 !text-xs" onClick={exportHtml}>⤓ Export</GhostBtn>
          </div>

          {/* AI generate */}
          <div className="nr-card !p-3 mb-3">
            <Label>✦ Generate from prompt</Label>
            <div className="flex gap-2">
              <Field value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. A landing page for a shoe brand" aria-label="AI page prompt" disabled={aiBusy} />
              <Btn className="!px-3" onClick={generateWithAI} disabled={aiBusy || !aiPrompt.trim()}>{aiBusy ? '…' : '✦'}</Btn>
            </div>
            <p className="text-[10px] opacity-50 mt-1.5">Needs AI configured in Settings. Generated code lands in the editors below.</p>
          </div>

          {/* tabs */}
          <div className="flex rounded-xl p-1 gap-1 nr-glass !p-1 mb-3" role="tablist" aria-label="Code editors">
            {(['html', 'css', 'js'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase transition ${tab === t ? 'text-black' : 'opacity-60'}`}
                style={tab === t ? { background: 'var(--accent)' } : undefined}>{t}</button>
            ))}
          </div>
          <Area rows={10} value={editorVal} onChange={(e) => update({ [tab]: e.target.value } as Partial<StudioPage>)}
            aria-label={`${tab} editor`} spellCheck={false} className="font-mono !text-[12.5px] leading-relaxed mb-3" />

          <h2 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Live preview (sandboxed)</h2>
          <div className="rounded-2xl overflow-hidden border mb-4" style={{ borderColor: 'var(--border)' }}>
            <iframe title="Page preview" srcDoc={srcDoc} sandbox="allow-scripts"
              className="w-full bg-white" style={{ height: 320 }} />
          </div>
          <p className="text-[10px] opacity-50 mb-2">Preview runs in a restrictive sandbox — generated code can't touch your data.</p>
        </>
      )}

      {showTemplates && (
        <Modal title="New page" onClose={() => setShowTemplates(false)}>
          <div className="grid grid-cols-1 gap-2.5">
            <button onClick={() => newPage()} className="nr-card !p-4 text-left active:scale-[0.99] transition">
              <div className="font-bold text-sm">Blank page</div>
              <div className="text-xs opacity-60">Start from nothing.</div>
            </button>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => newPage(t)} className="nr-card !p-4 text-left active:scale-[0.99] transition">
                <div className="font-bold text-sm">{t.name}</div>
                <div className="text-xs opacity-60">Template with sample content.</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showPages && (
        <Modal title="Your pages" onClose={() => setShowPages(false)}>
          <div className="flex flex-col gap-2">
            {pages.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: p.id === activeId ? 'var(--accent-soft)' : 'var(--surface-solid)' }}>
                <button className="flex-1 text-left min-w-0" onClick={() => { setActiveId(p.id); setShowPages(false); }}>
                  <div className="text-sm font-semibold truncate">{p.name} {p.demo && <DemoBadge />}</div>
                  <div className="text-[11px] opacity-50">{new Date(p.updatedAt).toLocaleDateString()} · {p.template}</div>
                </button>
                <button onClick={() => remove(p)} aria-label={`Delete ${p.name}`} className="opacity-50 px-2">🗑</button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {confirmUi}
    </div>
  );
}
