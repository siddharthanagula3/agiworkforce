'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useIsMobile } from '@shared/hooks/use-mobile';
import { MARKETING } from '@/lib/marketing-constants';

const SPRING_EASE = [0.16, 1, 0.3, 1] as const;

interface Surface {
  icon: string;
  label: string;
  tech: string;
  color: string;
  features: string[];
  mockup: React.ReactNode;
}

/* ─── Desktop Mockup ──────────────────────────────────────────────── */
function DesktopMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-1 shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 rounded-t-lg bg-[#1a1a1a] px-3 py-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="ml-2 text-[10px] text-zinc-500">AGI Workforce</span>
        </div>
        {/* App content */}
        <div className="flex h-80 rounded-b-lg bg-[#111]">
          {/* Sidebar */}
          <div className="w-14 border-r border-white/5 bg-[#0e0e0e] p-2">
            <div className="mb-3 rounded-md bg-[#c8892a]/20 px-1.5 py-1 text-center text-[7px] font-medium text-[#c8892a]">
              + New
            </div>
            {[
              { name: 'Refactor auth...', dot: '#a855f7' },
              { name: 'Write tests for...', dot: '#06b6d4' },
              { name: 'Debug API...', dot: '#10b981' },
              { name: 'Design landing...', dot: '#f59e0b' },
              { name: 'Optimize DB...', dot: '#3b82f6' },
            ].map((chat) => (
              <div key={chat.name} className="mb-1.5 flex items-center gap-1 px-1">
                <div
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: chat.dot }}
                />
                <span className="truncate text-[6px] text-zinc-600">{chat.name}</span>
              </div>
            ))}
          </div>
          {/* Main chat area */}
          <div className="flex flex-1 flex-col">
            {/* Model selector */}
            <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
              <div className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[#c8892a]" />
                <span className="text-[8px] font-medium text-zinc-300">Claude Opus 4</span>
                <span className="text-[8px] text-zinc-600">&#9662;</span>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-hidden p-3">
              {/* User message */}
              <div className="flex justify-end">
                <div className="max-w-[75%] rounded-xl rounded-br-sm bg-[#c8892a]/15 px-3 py-2">
                  <p className="text-[8px] leading-relaxed text-zinc-300">
                    Refactor the authentication module to use JWT tokens with refresh rotation
                  </p>
                </div>
              </div>
              {/* Assistant message */}
              <div className="max-w-[85%] space-y-2">
                <p className="text-[8px] leading-relaxed text-zinc-400">
                  I&apos;ll refactor the auth module. Let me read the existing implementation first.
                </p>
                {/* Code block */}
                <div className="rounded-md border border-white/5 bg-[#0a0a0a] p-2">
                  <div className="mb-1 flex items-center gap-1">
                    <span className="text-[6px] text-zinc-600">src/auth/jwt.rs</span>
                  </div>
                  <div className="font-mono text-[7px] leading-relaxed">
                    <span className="text-blue-400">pub fn</span>{' '}
                    <span className="text-yellow-300">create_token</span>
                    <span className="text-zinc-500">(</span>
                    <span className="text-cyan-300">claims</span>
                    <span className="text-zinc-500">
                      : &amp;Claims) {'{'}...{'}'}
                    </span>
                  </div>
                </div>
                {/* Tool status */}
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[7px] font-medium text-emerald-400">Applied 3 changes</span>
                </div>
              </div>
            </div>
            {/* Input bar */}
            <div className="border-t border-white/5 px-3 py-2">
              <div className="flex items-center rounded-lg bg-white/5 px-2.5 py-1.5">
                <span className="text-[8px] text-zinc-600">Message AGI Workforce...</span>
                <div className="ml-auto h-4 w-4 rounded-md bg-[#c8892a]/30 p-0.5">
                  <div className="h-full w-full rounded-sm bg-[#c8892a]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Web Mockup ──────────────────────────────────────────────────── */
function WebMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl overflow-hidden">
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
        {/* Web app */}
        <div className="flex h-80 bg-[#111]">
          {/* Sidebar indicator */}
          <div className="w-10 border-r border-white/5 bg-[#0e0e0e] py-3">
            {['💬', '🔧', '📁', '⚙️'].map((e) => (
              <div key={e} className="mb-2 flex justify-center text-[8px] opacity-50">
                {e}
              </div>
            ))}
          </div>
          {/* Chat content */}
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
              <div className="flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="text-[8px] font-medium text-cyan-300">GPT-4o</span>
              </div>
              <span className="text-[7px] text-zinc-600">New conversation</span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-xl rounded-br-sm bg-cyan-500/10 px-3 py-2">
                  <p className="text-[8px] text-zinc-300">Summarize my quarterly sales report</p>
                </div>
              </div>
              <div className="max-w-[80%] space-y-1.5">
                <p className="text-[8px] leading-relaxed text-zinc-400">
                  Here&apos;s your Q4 summary. Revenue grew 23% YoY, with enterprise deals up 41%.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Revenue', value: '$2.4M' },
                    { label: 'Growth', value: '+23%' },
                    { label: 'Enterprise', value: '+41%' },
                    { label: 'Churn', value: '2.1%' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-md border border-white/5 bg-white/[0.03] p-1.5"
                    >
                      <div className="text-[6px] text-zinc-600">{s.label}</div>
                      <div className="text-[9px] font-semibold text-cyan-300">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-white/5 px-3 py-2">
              <div className="rounded-lg bg-white/5 px-2.5 py-1.5">
                <span className="text-[8px] text-zinc-600">Ask a follow-up...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── CLI Mockup ──────────────────────────────────────────────────── */
function CliMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center bg-[#1a1a1a] px-3 py-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="ml-3 text-[10px] text-zinc-500">Terminal — bash</span>
        </div>
        {/* Terminal content */}
        <div className="h-80 space-y-1 p-4 font-mono text-[11px] leading-relaxed">
          <div>
            <span className="text-emerald-400">❯ </span>
            <span className="text-white/80">agiworkforce chat --model claude-opus</span>
          </div>
          <div className="text-zinc-600">───────────────────────────────────────</div>
          <div className="text-purple-300/80">⣾ Analyzing repository structure...</div>
          <div className="text-purple-300/80">
            ⚡ Reading <span className="text-cyan-300/70">src/auth/mod.rs</span>
          </div>
          <div className="text-purple-300/80">
            ⚡ Reading <span className="text-cyan-300/70">src/auth/session.rs</span>
          </div>
          <div className="text-purple-300/80">
            ⚡ Writing <span className="text-cyan-300/70">src/auth/jwt.rs</span>
          </div>
          <div className="text-purple-300/80">
            ⚡ Writing <span className="text-cyan-300/70">src/auth/refresh.rs</span>
          </div>
          <div className="text-purple-300/80">⚡ Updating 4 test files...</div>
          <div className="text-zinc-600">───────────────────────────────────────</div>
          <div className="text-emerald-400/90">✓ 6 files modified, all 48 tests passing</div>
          <div className="text-zinc-600 mt-1">Tokens: 12,847 in · 3,291 out · Cost: $0.08</div>
          <div className="mt-2">
            <span className="text-emerald-400">❯ </span>
            <span className="inline-block h-3.5 w-1.5 animate-[cursor-blink_1s_step-end_infinite] bg-white/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── VS Code Mockup ──────────────────────────────────────────────── */
function VsCodeMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center bg-[#2d2d2d] px-3 py-1.5">
          <span className="text-[10px] text-zinc-500">main.tsx — AGI Workforce — VS Code</span>
        </div>
        <div className="flex h-80">
          {/* Activity bar */}
          <div className="flex w-8 flex-col items-center gap-3 bg-[#2d2d2d] py-3">
            {['📄', '🔍', '⎇', '🐛', '🧩'].map((icon) => (
              <span key={icon} className="text-[8px] opacity-40">
                {icon}
              </span>
            ))}
          </div>
          {/* Editor */}
          <div className="flex-1 p-3 font-mono text-[10px] leading-relaxed">
            {/* Line numbers + code */}
            {[
              {
                num: 1,
                code: (
                  <>
                    <span className="text-blue-400">import</span> {'{'}{' '}
                    <span className="text-cyan-300">useState</span> {'}'}{' '}
                    <span className="text-blue-400">from</span>{' '}
                    <span className="text-orange-300">&apos;react&apos;</span>
                  </>
                ),
              },
              {
                num: 2,
                code: (
                  <>
                    <span className="text-blue-400">import</span> {'{'}{' '}
                    <span className="text-cyan-300">invoke</span> {'}'}{' '}
                    <span className="text-blue-400">from</span>{' '}
                    <span className="text-orange-300">&apos;@tauri&apos;</span>
                  </>
                ),
              },
              { num: 3, code: <span className="text-zinc-600" /> },
              {
                num: 4,
                code: (
                  <>
                    <span className="text-blue-400">export const</span>{' '}
                    <span className="text-yellow-300">AuthHandler</span> = () =&gt; {'{'}
                  </>
                ),
              },
              {
                num: 5,
                code: (
                  <>
                    &nbsp; <span className="text-blue-400">const</span> [
                    <span className="text-cyan-300">token</span>,{' '}
                    <span className="text-cyan-300">setToken</span>] ={' '}
                    <span className="text-yellow-300">useState</span>(
                    <span className="text-orange-300">null</span>)
                  </>
                ),
              },
              { num: 6, code: <span className="text-zinc-600" /> },
              {
                num: 7,
                code: (
                  <>
                    &nbsp; <span className="text-blue-400">const</span>{' '}
                    <span className="text-yellow-300">refresh</span> ={' '}
                    <span className="text-blue-400">async</span> () =&gt; {'{'}
                  </>
                ),
              },
              {
                num: 8,
                code: (
                  <>
                    &nbsp;&nbsp;&nbsp; <span className="text-blue-400">const</span>{' '}
                    <span className="text-cyan-300">res</span> ={' '}
                    <span className="text-blue-400">await</span>{' '}
                    <span className="text-green-300">invoke</span>(
                    <span className="text-orange-300">&apos;refresh_jwt&apos;</span>)
                  </>
                ),
              },
              {
                num: 9,
                code: (
                  <>
                    &nbsp;&nbsp;&nbsp; <span className="text-cyan-300">setToken</span>(
                    <span className="text-cyan-300">res</span>.
                    <span className="text-cyan-300">token</span>)
                  </>
                ),
              },
              { num: 10, code: <>&nbsp; {'}'}</> },
            ].map((line) => (
              <div key={line.num} className="flex">
                <span className="mr-3 w-5 text-right text-zinc-600">{line.num}</span>
                <span className="text-zinc-300">{line.code}</span>
              </div>
            ))}
          </div>
          {/* @agi panel */}
          <div className="w-40 border-l border-white/5 bg-[#252526] p-2">
            <div className="mb-2 flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-[9px] font-bold text-blue-400">@agi</span>
            </div>
            <div className="mb-2 rounded-md bg-blue-500/5 p-1.5">
              <p className="text-[7px] text-zinc-500">@agi optimize this refresh function</p>
            </div>
            <div className="space-y-1">
              <p className="text-[7px] leading-relaxed text-zinc-400">
                Added error handling and retry logic with exponential backoff.
              </p>
              <div className="rounded-md border border-white/5 bg-[#1e1e1e] p-1 font-mono text-[6px] text-zinc-400">
                + retryWithBackoff(refresh, 3)
              </div>
              <div className="mt-1.5 rounded bg-emerald-500/15 px-2 py-1 text-center text-[8px] font-medium text-emerald-400">
                ✓ Apply
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Browser Extension Mockup ────────────────────────────────────── */
function ExtensionMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="ml-2 flex-1 rounded-md bg-[#111] px-3 py-1">
            <span className="text-[10px] text-zinc-500">github.com/acme/myproject</span>
          </div>
          <div className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
            AGI
          </div>
        </div>
        {/* Page + side panel */}
        <div className="relative flex h-80 bg-[#111]">
          {/* Background page */}
          <div className="flex-1 p-4 opacity-40">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-4 w-4 rounded-sm bg-white/10" />
              <div className="h-2.5 w-32 rounded bg-white/10" />
            </div>
            <div className="mb-3 h-2 w-48 rounded bg-white/5" />
            <div className="space-y-1.5">
              {['README.md', 'src/', 'package.json', 'tsconfig.json', '.github/'].map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-sm bg-white/10" />
                  <span className="text-[8px] text-zinc-600">{f}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Extension side panel */}
          <div className="w-48 border-l border-amber-500/20 bg-[#141310]/95 p-3 backdrop-blur-xl">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-400">AGI Workforce</span>
              <span className="text-[8px] text-zinc-600">✕</span>
            </div>
            <div className="mb-3 rounded-md bg-amber-500/5 px-2 py-1">
              <span className="text-[7px] text-zinc-500">Reading: github.com/acme/myproject</span>
            </div>
            <div className="mb-3 space-y-1.5">
              {['Summarize this repo', 'Explain PR #42', 'Review code changes'].map((action) => (
                <div
                  key={action}
                  className="rounded-md bg-white/5 px-2 py-1.5 text-[8px] text-zinc-300"
                >
                  {action}
                </div>
              ))}
            </div>
            <div className="mt-auto rounded-md bg-white/5 px-2 py-1.5">
              <span className="text-[7px] text-zinc-600">Ask about this page...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile Mockup ───────────────────────────────────────────────── */
function MobileMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 180 }}>
      {/* Phone frame */}
      <div
        className="rounded-[36px] border-[3px] border-zinc-700 bg-[#0e0e0e] p-1.5 shadow-2xl"
        style={{ aspectRatio: '9 / 19.5' }}
      >
        {/* Dynamic Island */}
        <div className="mx-auto mb-1 h-5 w-20 rounded-b-2xl bg-black" />
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-0.5">
          <span className="text-[7px] font-medium text-white/70">9:41</span>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-3 rounded-sm border border-white/30">
              <div className="ml-auto h-full w-2/3 rounded-sm bg-emerald-400" />
            </div>
          </div>
        </div>
        {/* Screen */}
        <div className="mx-1 flex flex-1 flex-col rounded-[22px] bg-[#111] p-2.5">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[8px] font-bold text-white">AGI Workforce</span>
            <div className="h-3 w-3 rounded-full bg-emerald-500/20">
              <div className="mx-auto mt-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-[pulse_2s_infinite]" />
            </div>
          </div>
          {/* Agent status card */}
          <div className="mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-[pulse_2s_infinite]" />
              <span className="text-[7px] font-medium text-emerald-300">3 agents running</span>
            </div>
            <div className="mt-1 flex gap-1">
              {['Refactor', 'Tests', 'Docs'].map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[5px] text-emerald-400"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
          {/* Chat messages */}
          <div className="flex-1 space-y-2">
            <div className="flex justify-end">
              <div className="rounded-xl rounded-br-sm bg-emerald-500/15 px-2 py-1.5">
                <p className="text-[6px] text-zinc-300">Deploy the new auth module</p>
              </div>
            </div>
            <div className="max-w-[85%]">
              <p className="text-[6px] leading-relaxed text-zinc-400">
                All 3 agents completed. Merged to main, CI passing. Ready for deploy.
              </p>
            </div>
          </div>
          {/* Bottom tab bar */}
          <div className="mt-2 flex items-center justify-around rounded-xl bg-white/5 py-1.5">
            {[
              { icon: '💬', label: 'Chat', active: true },
              { icon: '🤖', label: 'Agents', active: false },
              { icon: '⚙️', label: 'Settings', active: false },
            ].map((tab) => (
              <div key={tab.label} className="flex flex-col items-center gap-0.5">
                <span className="text-[7px]">{tab.icon}</span>
                <span
                  className={`text-[5px] ${tab.active ? 'text-emerald-400 font-medium' : 'text-zinc-600'}`}
                >
                  {tab.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Surfaces Data ───────────────────────────────────────────────── */
const surfaces: Surface[] = [
  {
    icon: '🖥️',
    label: 'Desktop',
    tech: 'Tauri v2 · Rust + React 19',
    color: '#c8892a',
    features: [
      'Full computer use — browser, keyboard, screen capture',
      `${MARKETING.tools.display} native IPC tools, no plugins required`,
      'Runs Ollama, LM Studio, and local models offline',
    ],
    mockup: <DesktopMockup />,
  },
  {
    icon: '🌐',
    label: 'Web',
    tech: 'Next.js SPA',
    color: '#06b6d4',
    features: [
      'Access from any browser — Chrome, Safari, Firefox, Edge',
      'Same AI capabilities as the desktop app',
      'No install needed, share links to conversations',
    ],
    mockup: <WebMockup />,
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
    mockup: <CliMockup />,
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
    mockup: <VsCodeMockup />,
  },
  {
    icon: '🔌',
    label: 'Browser Extension',
    tech: 'Chrome MV3',
    color: '#f59e0b',
    features: [
      'AI overlay on any webpage — summarize, extract, act',
      "Context extraction from the page you're viewing",
      'Quick actions — explain, translate, rewrite, code review',
    ],
    mockup: <ExtensionMockup />,
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
    mockup: <MobileMockup />,
  },
];

/* ─── Progress Indicator ──────────────────────────────────────────── */
function ProgressIndicator({ activeIndex, total }: { activeIndex: number; total: number }) {
  return (
    <div className="hidden md:flex flex-col items-center gap-2">
      <span className="mb-1 font-mono text-[10px] text-[#c8892a]">
        {String(activeIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
      <div className="relative flex flex-col items-center gap-2">
        {/* Connecting line */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
        {/* Active fill */}
        <motion.div
          className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-[#c8892a] origin-top"
          animate={{ height: `${(activeIndex / (total - 1)) * 100}%` }}
          transition={{ duration: 0.4, ease: SPRING_EASE }}
        />
        {Array.from({ length: total }).map((_, i) => (
          <motion.div
            key={i}
            className="relative z-10 rounded-full"
            animate={{
              width: i === activeIndex ? 10 : 6,
              height: i === activeIndex ? 10 : 6,
              backgroundColor: i <= activeIndex ? '#c8892a' : 'rgba(255,255,255,0.15)',
            }}
            transition={{ duration: 0.3, ease: SPRING_EASE }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Static Fallback (mobile / reduced-motion) ──────────────────── */
function SurfaceShowcaseStatic() {
  return (
    <div className="mt-20 space-y-px bg-[#1a1917]">
      {surfaces.map((s) => (
        <div key={s.label} className="bg-[#09090b]">
          <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-10 md:grid-cols-[1fr_2fr] md:py-14">
            <div>
              <p className="mb-1 font-mono text-xs text-[#555150]">{s.tech}</p>
              <h3 className="mb-3 text-xl font-bold text-[#edebe8]">{s.label}</h3>
              <ul className="space-y-2">
                {s.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs leading-relaxed text-[#888480]"
                  >
                    <span className="mt-0.5 text-[#c8892a]">&#8226;</span>
                    <span dangerouslySetInnerHTML={{ __html: f }} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-center">{s.mockup}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */
const VH_PER_SURFACE = 60;

export function SurfaceShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 0.3', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    // Clamp to valid range — progress can be slightly negative before section fully enters
    const clamped = Math.max(0, Math.min(1, v));
    const idx = Math.min(Math.floor(clamped * surfaces.length), surfaces.length - 1);
    if (idx >= 0 && idx !== activeIndex) {
      setActiveIndex(idx);
    }
  });

  // Mobile / reduced-motion fallback
  if (reducedMotion || isMobile) {
    return <SurfaceShowcaseStatic />;
  }

  const active = surfaces[activeIndex];
  if (!active) return <SurfaceShowcaseStatic />;

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#09090b]"
      style={{ height: `${surfaces.length * VH_PER_SURFACE}vh` }}
    >
      {/* Sticky viewport — offset for fixed header (h-16 = 4rem) */}
      <div className="sticky top-16 flex h-[calc(100vh-4rem)] items-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-4">
          {/* Section header */}
          <div className="mb-8">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Surfaces
            </p>
            <h2 className="font-heading text-3xl tracking-tight md:text-4xl text-[#edebe8]">
              Available on every surface
            </h2>
          </div>

          {/* Content grid */}
          <div className="grid items-center gap-8 md:grid-cols-[2fr_1fr]">
            {/* Left — Mockup */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -20 }}
                transition={{ duration: 0.4, ease: SPRING_EASE }}
              >
                {active.mockup}
              </motion.div>
            </AnimatePresence>

            {/* Right — Info + Progress */}
            <div className="flex gap-6">
              {/* Text content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIndex}
                  className="flex-1"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35, ease: SPRING_EASE }}
                >
                  {/* Color accent bar */}
                  <div
                    className="mb-4 h-0.5 w-12 rounded-full"
                    style={{ backgroundColor: active.color }}
                  />
                  <p className="mb-1 font-mono text-xs" style={{ color: `${active.color}99` }}>
                    {active.tech}
                  </p>
                  <h3 className="mb-1 flex items-center gap-2 text-2xl font-bold text-[#edebe8]">
                    <span>{active.icon}</span>
                    {active.label}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {active.features.map((f, i) => (
                      <motion.li
                        key={f}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: 0.1 + i * 0.06,
                          duration: 0.3,
                          ease: SPRING_EASE,
                        }}
                        className="flex items-start gap-2 text-sm leading-relaxed text-[#888480]"
                      >
                        <span className="mt-0.5" style={{ color: active.color }}>
                          &#8226;
                        </span>
                        <span dangerouslySetInnerHTML={{ __html: f }} />
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>

              {/* Progress dots */}
              <ProgressIndicator activeIndex={activeIndex} total={surfaces.length} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
