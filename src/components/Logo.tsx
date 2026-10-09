import React from 'react';

/** Original orbital-inspired NEXORA mark — pure SVG, no assets. */
export function NexoraLogo({ size = 40, animate = true }: { size?: number; animate?: boolean }) {
  const accent = 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="NEXORA logo">
      <defs>
        <radialGradient id="nx-core" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <g className={animate ? 'animate-orbit-spin' : undefined} style={{ transformOrigin: '32px 32px' }}>
        <ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke={accent} strokeWidth="1.6" opacity="0.85" />
        <circle cx="60" cy="32" r="2.6" fill={accent} />
      </g>
      <g className={animate ? 'animate-orbit-spin-rev' : undefined} style={{ transformOrigin: '32px 32px' }}>
        <ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke="#38bdf8" strokeWidth="1.1" opacity="0.55"
          transform="rotate(65 32 32)" />
        <circle cx="32" cy="4.6" r="2" fill="#38bdf8" transform="rotate(65 32 32)" opacity="0" />
      </g>
      <circle cx="32" cy="32" r="10.5" fill="url(#nx-core)" />
      <path d="M27 27.5 L37 27.5 L29.5 36.5 L39 36.5" fill="none" stroke="#04120c" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NexoraWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <NexoraLogo size={compact ? 32 : 40} />
      <div className="leading-none">
        <div className={`font-extrabold tracking-[0.18em] ${compact ? 'text-sm' : 'text-base'}`}>NEXORA</div>
        <div className="text-[9px] tracking-[0.42em] opacity-60 font-semibold">REALITY</div>
      </div>
    </div>
  );
}
