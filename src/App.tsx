import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AppId } from './types';
import { ToastHost } from './components/ui';
import { Shell, View as ShellView } from './components/Shell';
import { loadPrefs, savePrefs, applyTheme, Prefs } from './services/prefs';
import { idb, logActivity } from './services/db';
import { seedIfEmpty } from './services/demo';
import { aiStatus } from './services/ai';
import { SkeletonList } from './components/ui';

const Home = lazy(() => import('./views/Home'));
const Launcher = lazy(() => import('./views/Launcher'));
const Commander = lazy(() => import('./views/Commander'));
const Onboarding = lazy(() => import('./views/Onboarding'));
const Studio = lazy(() => import('./apps/Studio'));
const Missions = lazy(() => import('./apps/Missions'));
const Vault = lazy(() => import('./apps/Vault'));
const Forge = lazy(() => import('./apps/Forge'));
const CodeLab = lazy(() => import('./apps/CodeLab'));
const FileVault = lazy(() => import('./apps/FileVault'));
const Focus = lazy(() => import('./apps/Focus'));
const Insights = lazy(() => import('./apps/Insights'));
const Settings = lazy(() => import('./apps/Settings'));

export const PrefsCtx = React.createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }>({
  prefs: loadPrefs(),
  setPrefs: () => {},
});

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [view, setView] = useState<ShellView>('home');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [aiReady, setAiReady] = useState(false);
  const [ready, setReady] = useState(false);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      savePrefs(next);
      applyTheme(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(prefs);
    document.documentElement.style.setProperty('--accent', prefs.accent);
    seedIfEmpty().catch(() => {});
    setReady(true);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    let alive = true;
    const check = async () => {
      const s = await aiStatus();
      if (alive) setAiReady(s.ok && (s.gemini || s.groq));
    };
    check();
    const iv = setInterval(check, 120_000);
    return () => { alive = false; window.removeEventListener('online', on); window.removeEventListener('offline', on); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyTheme(prefs); }, [prefs]);

  // hash routing: #/app/missions etc.
  useEffect(() => {
    const sync = () => {
      const h = location.hash.replace('#/', '');
      if (h === '' || h === 'home') setView('home');
      else if (h === 'launcher') setView('launcher');
      else setView(h as ShellView);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const go = useCallback((v: ShellView) => {
    location.hash = v === 'home' ? '#/' : `#/${v}`;
    document.getElementById('nr-main')?.scrollTo({ top: 0 });
  }, []);

  const openApp = useCallback((a: AppId) => {
    logActivity('app_open', a).catch(() => {});
    go(a);
  }, [go]);

  const content = useMemo(() => {
    switch (view) {
      case 'home': return <Home go={go} openApp={openApp} />;
      case 'launcher': return <Launcher openApp={openApp} />;
      case 'commander': return <Commander />;
      case 'studio': return <Studio />;
      case 'missions': return <Missions />;
      case 'vault': return <Vault />;
      case 'forge': return <Forge />;
      case 'codelab': return <CodeLab />;
      case 'files': return <FileVault />;
      case 'focus': return <Focus />;
      case 'insights': return <Insights />;
      case 'settings': return <Settings />;
      default: return <Home go={go} openApp={openApp} />;
    }
  }, [view, go, openApp]);

  if (!ready) return null;

  return (
    <PrefsCtx.Provider value={{ prefs, setPrefs }}>
      <ToastHost>
        {!prefs.onboarded ? (
          <div className="h-full nr-bg overflow-y-auto nr-scroll">
            <Suspense fallback={<div className="p-6"><SkeletonList /></div>}>
              <Onboarding done={() => setPrefs({ onboarded: true })} />
            </Suspense>
          </div>
        ) : (
          <Shell view={view} go={go} online={online} aiOnline={aiReady} onOpenApp={openApp}>
            <Suspense fallback={<SkeletonList rows={4} />}>{content}</Suspense>
          </Shell>
        )}
      </ToastHost>
    </PrefsCtx.Provider>
  );
}

