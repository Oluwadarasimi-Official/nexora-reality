import { idb } from './db';
import { uid } from '../types';

/** Realistic, clearly-labelled demo data seeded on first launch. Deletable anytime. */
export async function seedIfEmpty(): Promise<boolean> {
  const counts = await Promise.all([
    idb.count('tasks'), idb.count('notes'), idb.count('projects'),
    idb.count('snippets'), idb.count('studioPages'), idb.count('focusSessions'),
  ]);
  if (counts.some((c) => c > 0)) return false;
  const now = Date.now();
  const day = 86_400_000;
  const t = (d: number) => new Date(now + d * day).toISOString().slice(0, 10);

  const projId = uid();
  await idb.put('projects', {
    id: projId, name: 'NEXORA launch site', description: 'Personal landing page for the NEXORA universe.',
    status: 'active', color: '#10b981', context: 'Tech stack: Vite + React + Tailwind. Deploy target: Vercel.',
    milestones: [
      { id: uid(), title: 'Hero section drafted', done: true },
      { id: uid(), title: 'Project gallery wired', done: false, due: t(3) },
      { id: uid(), title: 'Deploy to production', done: false, due: t(7) },
    ],
    createdAt: now - 4 * day, demo: true,
  });

  await Promise.all([
    idb.put('tasks', { id: uid(), title: 'Review AI failover behaviour', notes: 'Kill Gemini key, watch Groq take over.', done: false, priority: 'high', due: t(0), projectId: projId, createdAt: now - 2 * day, demo: true }),
    idb.put('tasks', { id: uid(), title: '30-minute study session', done: false, priority: 'medium', due: t(0), recurring: 'daily', createdAt: now - 2 * day, demo: true }),
    idb.put('tasks', { id: uid(), title: 'Draft portfolio update notes', done: true, priority: 'low', createdAt: now - 3 * day, completedAt: now - 1 * day, demo: true }),
    idb.put('tasks', { id: uid(), title: 'Plan the week', done: false, priority: 'medium', due: t(2), createdAt: now - 1 * day, demo: true }),
  ]);

  await Promise.all([
    idb.put('notes', {
      id: uid(), title: 'Welcome to your Vault', folder: 'Start here', tags: ['guide'], favourite: true,
      body: '# Welcome 👋\n\nThis is your **Knowledge Vault**. A few things to try:\n\n- Tap **+** to create a note\n- Use `folders` and `#tags` to organise\n- Star favourites with the ☆ button\n- Everything is saved on your device\n\n> Demo notes are labelled DEMO — delete them anytime from Settings → Data.',
      updatedAt: now - 1 * day, createdAt: now - 2 * day, demo: true,
    }),
    idb.put('notes', {
      id: uid(), title: 'Study plan — JavaScript', folder: 'Learning', tags: ['study', 'code'],
      body: '## Week 1\n\n- [ ] Closures & scope\n- [ ] Promises and async/await\n- [ ] Build a tiny to-do app\n\n## Week 2\n\n- [ ] Fetch API deep-dive\n- [ ] Local storage patterns',
      updatedAt: now - 3 * 3_600_000, createdAt: now - 2 * day, favourite: false, demo: true,
    }),
  ]);

  await idb.put('snippets', {
    id: uid(), title: 'Debounce helper', language: 'javascript',
    code: `function debounce(fn, ms = 300) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n}`,
    notes: 'Delays a function until input stops — great for search boxes.',
    updatedAt: now - 1 * day, demo: true,
  });

  await idb.put('studioPages', {
    id: uid(), name: 'My first landing page', template: 'landing',
    html: `<header class="hero">\n  <h1>Hello, NEXORA</h1>\n  <p>A tiny site built inside Studio.</p>\n  <button onclick="greet()">Say hi</button>\n</header>`,
    css: `body{font-family:system-ui;background:#06121f;color:#eaf6f0;margin:0}\n.hero{padding:64px 24px;text-align:center}\nbutton{padding:12px 24px;border:0;border-radius:12px;background:#10b981;font-weight:700}`,
    js: `function greet(){ alert('Hello from your Studio page!'); }`,
    updatedAt: now - 1 * day, demo: true,
  });

  await idb.put('focusSessions', {
    id: uid(), label: 'Exam revision', minutesPlanned: 25, minutesActual: 25,
    finishedAt: now - 1 * day, completed: true, demo: true,
  });

  await idb.put('notifications', {
    id: uid(), title: 'Welcome to NEXORA REALITY', body: 'Your universe is ready. Everything runs on your device — AI connects when keys are configured.', ts: now, read: false, app: 'settings',
  });

  return true;
}

/** Remove every record flagged as demo data. Returns counts removed per store. */
export async function clearDemoData(): Promise<Record<string, number>> {
  const stores = ['tasks', 'notes', 'projects', 'snippets', 'studioPages', 'focusSessions'] as const;
  const out: Record<string, number> = {};
  for (const s of stores) {
    const all = await idb.all<{ id: string; demo?: boolean }>(s);
    const demo = all.filter((r) => r.demo);
    await Promise.all(demo.map((r) => idb.del(s, r.id)));
    out[s] = demo.length;
  }
  return out;
}
