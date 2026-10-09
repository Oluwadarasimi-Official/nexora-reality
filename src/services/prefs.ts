/* Lightweight preferences only — everything else lives in IndexedDB. */

export interface Prefs {
  name: string;
  onboarded: boolean;
  theme: 'dark' | 'light';
  accent: string;
  reduceMotion: boolean;
  largeText: boolean;
  pinned: string[]; // AppId[]
  widgets: string[]; // widget ids in order
  dailyGoal: number; // focus minutes target
}

const KEY = 'nr:prefs:v1';

const DEFAULTS: Prefs = {
  name: '',
  onboarded: false,
  theme: 'dark',
  accent: '#10b981',
  reduceMotion: false,
  largeText: false,
  pinned: ['commander', 'missions', 'vault', 'focus'],
  widgets: ['greeting', 'missions', 'focus', 'projects', 'notes', 'activity'],
  dailyGoal: 120,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / private mode — app still works in-memory */
  }
  return next;
}

export function applyTheme(p: Prefs) {
  document.documentElement.dataset.theme = p.theme;
  document.documentElement.style.setProperty('--accent', p.accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.theme === 'dark' ? '#06121f' : '#f2f7f4');
  document.body.classList.toggle('nr-large-text', p.largeText);
  document.documentElement.classList.toggle('nr-reduce-motion', p.reduceMotion);
}
