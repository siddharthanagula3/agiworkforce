'use client';

import { useEffect, useRef, useState } from 'react';

interface Surface {
  icon: string;
  label: string;
  tech: string;
  color: string;
  features: string[];
  mockup: React.ReactNode;
}

const surfaces: Surface[] = [
  {
    icon: '🖥️',
    label: 'Desktop',
    tech: 'Tauri v2 · Rust + React 19',
    color: '#3b82f6',
    features: [
      'Full computer use — browser, keyboard, screen capture',
      '1,300+ native IPC tools, no plugins required',
      'Runs Ollama, LM Studio, and local models offline',
    ],
    mockup: (
      <div className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-1 shadow-2xl shadow-blue-900/20">
          {/* Title bar */}
          <div className="flex items-center gap-2 rounded-t-lg bg-[#1a1a1a] px-3 py-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="ml-2 text-[10px] text-zinc-500">AGI Workforce</span>
          </div>
          {/* App body */}
          <div className="flex h-48 rounded-b-lg bg-[#111]">
            <div className="w-12 border-r border-white/5 bg-[#0e0e0e] py-3">
              {['💬', '🔧', '📁', '🌐', '⚙️'].map((e) => (
                <div key={e} className="mb-2 flex justify-center text-xs opacity-60">
                  {e}
                </div>
              ))}
            </div>
            <div className="flex-1 p-3">
              <div className="mb-2 h-2.5 w-24 rounded bg-blue-500/20" />
              <div className="mb-1.5 h-2 w-full rounded bg-white/5" />
              <div className="mb-1.5 h-2 w-3/4 rounded bg-white/5" />
              <div className="mt-4 h-2.5 w-32 rounded bg-emerald-500/20" />
              <div className="mb-1.5 mt-1 h-2 w-full rounded bg-white/5" />
              <div className="h-2 w-5/6 rounded bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: '🌐',
    label: 'Web',
    tech: 'Next.js 16 SPA',
    color: '#06b6d4',
    features: [
      'Access from any browser — Chrome, Safari, Firefox, Edge',
      'Same AI capabilities as the desktop app',
      'No install needed, share links to conversations',
    ],
    mockup: (
      <div className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl shadow-cyan-900/20 overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            </div>
            <div className="ml-2 flex-1 rounded-md bg-[#111] px-3 py-1">
              <span className="text-[10px] text-zinc-500">app.agiworkforce.com</span>
            </div>
          </div>
          <div className="h-48 bg-[#111] p-4">
            <div className="mb-3 h-3 w-40 rounded bg-cyan-500/20" />
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="mb-1.5 h-2 w-12 rounded bg-white/10" />
                  <div className="h-1.5 w-full rounded bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: '⌨️',
    label: 'CLI',
    tech: 'Rust binary · agiworkforce',
    color: '#a855f7',
    features: [
      'Terminal-native agent with streaming output',
      'Pipe-friendly — compose with grep, jq, and shell scripts',
      'CI/CD ready — run in GitHub Actions, Docker, headless',
    ],
    mockup: (
      <div className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 font-mono text-xs shadow-2xl shadow-purple-900/20">
          <div className="mb-1 text-zinc-600">$ agiworkforce chat</div>
          <div className="mb-1 text-emerald-400/80">▶ Connected to Claude Opus 4.6</div>
          <div className="mb-1 text-white/70">You: Refactor the auth module to use JWT</div>
          <div className="mb-1 text-zinc-500">───────────────────────────────────</div>
          <div className="mb-0.5 text-purple-300/80">⚡ Reading src/auth/mod.rs...</div>
          <div className="mb-0.5 text-purple-300/80">⚡ Writing src/auth/jwt.rs...</div>
          <div className="mb-0.5 text-purple-300/80">⚡ Updating 3 test files...</div>
          <div className="mb-1 text-zinc-500">───────────────────────────────────</div>
          <div className="text-emerald-400/80">✓ 4 files modified, all tests passing</div>
          <div className="mt-2 inline-block h-3.5 w-1.5 animate-pulse bg-white/60" />
        </div>
      </div>
    ),
  },
  {
    icon: '🧩',
    label: 'VS Code',
    tech: '@agi chat participant',
    color: '#3b82f6',
    features: [
      'Inline code assistance inside your editor',
      'Workspace-aware — understands your full project',
      'MCP integrated — same tools as the desktop app',
    ],
    mockup: (
      <div className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl shadow-blue-900/20 overflow-hidden">
          <div className="flex items-center bg-[#2d2d2d] px-3 py-1.5">
            <span className="text-[10px] text-zinc-500">main.tsx — AGI Workforce</span>
          </div>
          <div className="flex h-48">
            {/* Editor */}
            <div className="flex-1 p-3 font-mono text-[10px] leading-relaxed">
              <div>
                <span className="text-blue-400">const</span>{' '}
                <span className="text-cyan-300">handler</span> ={' '}
                <span className="text-yellow-300">async</span> () =&gt; {'{'}
              </div>
              <div>
                {' '}
                <span className="text-blue-400">const</span>{' '}
                <span className="text-cyan-300">result</span> ={' '}
                <span className="text-yellow-300">await</span>{' '}
                <span className="text-green-300">fetchData</span>()
              </div>
              <div>
                {' '}
                <span className="text-blue-400">return</span>{' '}
                <span className="text-cyan-300">result</span>.map(…)
              </div>
              <div>{'}'}</div>
            </div>
            {/* Side panel */}
            <div className="w-32 border-l border-white/5 bg-[#252526] p-2">
              <div className="mb-1.5 text-[9px] font-bold text-blue-400">@agi</div>
              <div className="mb-1 h-1.5 w-full rounded bg-white/5" />
              <div className="mb-1 h-1.5 w-3/4 rounded bg-white/5" />
              <div className="mt-3 rounded bg-emerald-500/10 px-1.5 py-1 text-[9px] text-emerald-400">
                ✓ Applied
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: '🔌',
    label: 'Browser Extension',
    tech: 'Chrome MV3',
    color: '#f59e0b',
    features: [
      'AI overlay on any webpage — summarize, extract, act',
      'Context extraction from the page you&apos;re viewing',
      'Quick actions — explain, translate, rewrite, code review',
    ],
    mockup: (
      <div className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl shadow-amber-900/20 overflow-hidden">
          <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            </div>
            <div className="ml-2 flex-1 rounded-md bg-[#111] px-3 py-1">
              <span className="text-[10px] text-zinc-500">github.com/agiworkforce</span>
            </div>
            <div className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400">
              AGI
            </div>
          </div>
          <div className="relative h-48 bg-[#111]">
            {/* Page content (blurred) */}
            <div className="p-4 opacity-40">
              <div className="mb-2 h-3 w-48 rounded bg-white/10" />
              <div className="mb-1 h-2 w-full rounded bg-white/5" />
              <div className="mb-1 h-2 w-3/4 rounded bg-white/5" />
            </div>
            {/* Extension popup */}
            <div className="absolute right-3 top-3 w-44 rounded-lg border border-amber-500/30 bg-[#1c1b1b]/95 p-3 backdrop-blur-xl shadow-lg">
              <div className="mb-2 text-[10px] font-bold text-amber-400">AGI Workforce</div>
              {['Summarize page', 'Extract data', 'Quick action'].map((a) => (
                <div
                  key={a}
                  className="mb-1 rounded bg-white/5 px-2 py-1 text-[9px] text-zinc-300 hover:bg-white/10"
                >
                  {a}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: '📱',
    label: 'Mobile',
    tech: 'Expo · iOS + Android',
    color: '#10b981',
    features: [
      'Monitor running agents from your phone',
      'Push notifications when tasks complete',
      'Quick prompts and conversation history on the go',
    ],
    mockup: (
      <div className="relative mx-auto w-40">
        <div className="rounded-[24px] border-2 border-white/10 bg-[#0e0e0e] p-1.5 shadow-2xl shadow-emerald-900/20">
          {/* Notch */}
          <div className="mx-auto mb-1 h-4 w-16 rounded-b-xl bg-[#0e0e0e]" />
          <div className="rounded-[18px] bg-[#111] p-3">
            <div className="mb-3 h-2.5 w-16 rounded bg-emerald-500/20" />
            <div className="mb-2 rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="mb-1 h-1.5 w-full rounded bg-white/10" />
              <div className="h-1.5 w-2/3 rounded bg-white/5" />
            </div>
            <div className="mb-2 rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="mb-1 h-1.5 w-full rounded bg-white/10" />
              <div className="h-1.5 w-1/2 rounded bg-white/5" />
            </div>
            <div className="mt-3 rounded-full bg-emerald-500/20 py-1.5 text-center text-[9px] text-emerald-400">
              + New prompt
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function SurfaceShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const panels = container.querySelectorAll<HTMLElement>('[data-surface-panel]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-surface-panel'));
            if (!isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      {
        root: null,
        threshold: 0.6,
      },
    );

    panels.forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, []);

  const active = surfaces[activeIndex] as Surface;

  return (
    <div ref={containerRef} className="relative mt-20">
      {/* Sticky viewport */}
      <div className="sticky top-16 z-30 mx-auto max-w-5xl px-4 pb-8">
        <div
          className="rounded-2xl border bg-[#131313]/80 p-8 backdrop-blur-2xl transition-all duration-700 md:p-12"
          style={{ borderColor: `${active.color}20` }}
        >
          <div className="grid items-center gap-8 md:grid-cols-2">
            {/* Left — Text */}
            <div className="transition-all duration-500">
              <div
                className="mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: `${active.color}30`,
                  backgroundColor: `${active.color}10`,
                  color: active.color,
                }}
              >
                <span className="text-sm">{active.icon}</span>
                {active.label}
              </div>
              <h3 className="mb-1 text-2xl font-bold text-[#e5e2e1] md:text-3xl">{active.label}</h3>
              <p className="mb-6 text-sm text-zinc-500">{active.tech}</p>
              <ul className="space-y-3">
                {active.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    <span dangerouslySetInnerHTML={{ __html: f }} />
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — Mockup */}
            <div className="transition-all duration-500">{active.mockup}</div>
          </div>

          {/* Surface dots */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {surfaces.map((s, i) => (
              <button
                key={s.label}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-8' : 'w-2 bg-zinc-700 hover:bg-zinc-500'
                }`}
                style={i === activeIndex ? { backgroundColor: active.color } : undefined}
                aria-label={`Show ${s.label}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Scroll panels — each one triggers the IntersectionObserver */}
      <div className="relative z-20">
        {surfaces.map((s, i) => (
          <div
            key={s.label}
            data-surface-panel={i}
            className="flex h-[70vh] items-center justify-center"
          >
            {/* Invisible scroll trigger — the sticky card above shows the content */}
            <span className="sr-only">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
