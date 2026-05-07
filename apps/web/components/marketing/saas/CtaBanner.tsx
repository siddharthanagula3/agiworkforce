'use client';

import Link from 'next/link';
import { useState } from 'react';

const INSTALL_CMD = 'curl -fsSL https://agiworkforce.com/install.sh | sh';

export function CtaBanner() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section
      className="relative overflow-hidden py-32"
      style={{ background: 'var(--color-saas-bg)' }}
    >
      {/* Bottom-center ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[500px]"
        style={{
          background:
            'radial-gradient(ellipse 55% 60% at 50% 100%, rgba(109,255,172,0.1), transparent 72%)',
        }}
      />

      {/* Dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(109,255,172,0.14) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          opacity: 0.03,
        }}
      />

      <div className="relative container mx-auto px-4">
        {/* ── Asymmetric layout: headline left, install right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left — headline */}
          <div>
            <p
              className="font-mono text-[10px] tracking-[0.26em] uppercase mb-5"
              style={{ color: 'var(--color-saas-mint)' }}
            >
              Get started
            </p>
            <h2
              className="leading-[0.9] mb-6"
              style={{
                fontFamily: 'var(--font-syne)',
                fontWeight: 800,
                fontSize: 'clamp(2.5rem, 5.5vw, 5rem)',
                letterSpacing: '-0.05em',
                color: 'var(--color-saas-text)',
              }}
            >
              Start with every
              <br />
              AI model.
              <br />
              <span style={{ color: 'var(--color-saas-mint)' }}>Free, forever.</span>
            </h2>
            <p
              className="max-w-sm leading-relaxed mb-8"
              style={{
                fontFamily: 'var(--font-outfit)',
                fontSize: '1rem',
                color: 'var(--color-saas-text-muted)',
              }}
            >
              Local + BYOK tiers are free forever — no credit card, no account required for Local
              mode. Install in 10 seconds.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/download"
                className="inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{
                  fontFamily: 'var(--font-outfit)',
                  fontWeight: 600,
                  background: 'var(--color-saas-mint)',
                  color: '#09090b',
                }}
              >
                Download free
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-full border px-6 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                style={{
                  fontFamily: 'var(--font-outfit)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: 'var(--color-saas-text)',
                }}
              >
                View pricing →
              </Link>
            </div>
          </div>

          {/* Right — install command card */}
          <div>
            <div
              className="rounded-2xl border overflow-hidden"
              style={{
                background: 'var(--color-saas-surface)',
                borderColor: 'rgba(255,255,255,0.07)',
                boxShadow: '0 0 60px -20px rgba(109,255,172,0.06)',
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-2 px-5 py-3.5 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#febc2e' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28c840' }} />
                <span
                  className="flex-1 text-center font-mono text-[10px]"
                  style={{ color: '#3f3f46' }}
                >
                  Install AGI Workforce
                </span>
              </div>

              {/* Commands */}
              <div className="p-5 font-mono text-[13px]">
                <div className="mb-3" style={{ color: '#3f3f46' }}>
                  # macOS / Linux / WSL
                </div>
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-3 mb-4"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-[12px] truncate" style={{ color: '#a1a1aa' }}>
                    {INSTALL_CMD}
                  </span>
                  <button
                    onClick={handleCopy}
                    aria-label="Copy install command"
                    className="shrink-0 ml-3 rounded-lg border px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase transition-all"
                    style={{
                      borderColor: copied ? 'rgba(109,255,172,0.4)' : 'rgba(255,255,255,0.1)',
                      color: copied ? 'var(--color-saas-mint)' : '#71717a',
                      background: copied ? 'rgba(109,255,172,0.08)' : 'transparent',
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <div style={{ color: '#3f3f46' }} className="mb-1">
                  # then run your first task
                </div>
                <div style={{ color: '#71717a' }}>
                  {'$ '}
                  <span style={{ color: 'var(--color-saas-mint)' }}>agiworkforce</span>
                  {' exec "summarize this codebase"'}
                </div>
              </div>

              {/* Footer strip */}
              <div
                className="flex items-center justify-between px-5 py-3 border-t font-mono text-[10px] tracking-[0.1em]"
                style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#3f3f46' }}
              >
                <span>macOS · Linux · WSL</span>
                <Link
                  href="/download"
                  className="hover:underline"
                  style={{ color: 'rgba(109,255,172,0.6)' }}
                >
                  Windows installer →
                </Link>
              </div>
            </div>

            {/* Sub-note */}
            <p className="mt-4 font-mono text-[10px] tracking-[0.1em]" style={{ color: '#3f3f46' }}>
              ~35 MB · No telemetry without consent · Open BYOK model
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
