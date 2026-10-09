import React, { useContext, useState } from 'react';
import { NexoraLogo } from '../components/Logo';
import { Btn, Field, GhostBtn, Label } from '../components/ui';
import { PrefsCtx } from '../App';
import { APPS } from '../types';

const ACCENTS = ['#10b981', '#38bdf8', '#a78bfa', '#f59e0b', '#f472b6', '#d4af37'];

export default function Onboarding({ done }: { done: () => void }) {
  const { prefs, setPrefs } = useContext(PrefsCtx);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefs.name);

  const finish = () => {
    setPrefs({ name: name.trim(), onboarded: true });
    done();
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 max-w-md mx-auto">
      <div className="animate-float-slow mb-6"><NexoraLogo size={88} /></div>

      {step === 0 && (
        <div className="w-full animate-fade-up text-center">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Welcome to<br />NEXORA REALITY</h1>
          <p className="text-sm opacity-70 mb-8">Your personal AI-powered universe — tasks, notes, projects, code and focus, all on your device.</p>
          <Btn className="w-full !py-3.5" onClick={() => setStep(1)}>Enter your universe →</Btn>
        </div>
      )}

      {step === 1 && (
        <div className="w-full animate-fade-up">
          <h2 className="text-xl font-bold mb-1">What should Nexora call you?</h2>
          <p className="text-sm opacity-60 mb-5">Stored only on this device. You can change it anytime in Settings.</p>
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
            maxLength={40} aria-label="Your name" autoFocus />
          <div className="flex gap-3 mt-6">
            <GhostBtn onClick={() => setStep(0)}>Back</GhostBtn>
            <Btn className="flex-1" onClick={() => setStep(2)}>Continue →</Btn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="w-full animate-fade-up">
          <h2 className="text-xl font-bold mb-1">Make it yours</h2>
          <p className="text-sm opacity-60 mb-5">Theme and accent — changeable anytime.</p>
          <Label>Theme</Label>
          <div className="flex gap-3 mb-5">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} onClick={() => setPrefs({ theme: t })}
                className={`flex-1 rounded-2xl p-4 border-2 capitalize font-bold text-sm transition ${prefs.theme === t ? 'border-emerald-400' : 'opacity-60'}`}
                style={{ borderColor: prefs.theme === t ? 'var(--accent)' : 'var(--border)', background: 'var(--surface)' }}>
                {t === 'dark' ? '🌙' : '☀️'} {t}
              </button>
            ))}
          </div>
          <Label>Accent colour</Label>
          <div className="flex gap-3 mb-8">
            {ACCENTS.map((c) => (
              <button key={c} onClick={() => setPrefs({ accent: c })} aria-label={`Accent ${c}`}
                className="w-10 h-10 rounded-full transition active:scale-90"
                style={{ background: c, boxShadow: prefs.accent === c ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : 'none' }} />
            ))}
          </div>
          <div className="flex gap-3">
            <GhostBtn onClick={() => setStep(1)}>Back</GhostBtn>
            <Btn className="flex-1" onClick={() => setStep(3)}>Continue →</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="w-full animate-fade-up">
          <h2 className="text-xl font-bold mb-1">Your universe, at a glance</h2>
          <p className="text-sm opacity-60 mb-5">Ten mini-apps, one command bar. Everything works offline.</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {APPS.slice(0, 6).map((a) => (
              <div key={a.id} className="nr-card !p-3 flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${a.accent}22`, color: a.accent }}>{a.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{a.name}</div>
                  <div className="text-[10px] opacity-55 truncate">{a.tagline}</div>
                </div>
              </div>
            ))}
          </div>
          <Btn className="w-full !py-3.5" onClick={finish}>Launch NEXORA ✦</Btn>
          <button onClick={() => setStep(2)} className="w-full text-center text-xs opacity-50 mt-3">← Back</button>
        </div>
      )}
    </div>
  );
}
