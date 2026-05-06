'use client';

import { useState } from 'react';

import { Slug } from './Slug';

interface DispatchSectionProps {
  slugIndex?: string;
  slugKicker?: string;
}

/**
 * S6 — DISPATCH (final CTA).
 * Graphite section with amber ruled chrome.
 * Left: locked tagline as italic display kicker.
 * Right: mono install command block with clipboard copy button.
 * Below: full-width hairline rule + colophon strip.
 */
export function DispatchSection({
  slugIndex = '07',
  slugKicker = 'DISPATCH',
}: DispatchSectionProps) {
  const [copied, setCopied] = useState(false);

  const installCmd = 'curl -fsSL https://agiworkforce.com/install.sh | sh';

  function handleCopy() {
    navigator.clipboard.writeText(installCmd).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      (err) => {
        console.error('Copy failed:', err);
      },
    );
  }

  return (
    <section
      id="dispatch"
      aria-labelledby="dispatch-heading"
      className="bg-[var(--color-graphite)] border-t-[3px] border-[var(--color-rule)]"
    >
      {/* Hairline rule below the thick amber top rule */}
      <div className="border-t border-[var(--color-rule-soft)]" />

      <div className="container mx-auto px-4 py-16 md:py-24">
        {/* Slug */}
        <Slug index={slugIndex} kicker={slugKicker} date="2026.05.05" />

        {/* Two-column body */}
        <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          {/* Left column — tagline */}
          <div className="flex flex-col justify-center">
            <p
              id="dispatch-heading"
              className="font-display italic font-bold text-3xl md:text-5xl text-[var(--color-cream-on-graphite)] leading-[1.04]"
            >
              Beyond one model. Beyond one surface.{' '}
              <em className="border-b-[3px] border-[var(--color-rule)] pb-1">AGI in your hands.</em>
            </p>
          </div>

          {/* Right column — install command */}
          <div className="flex flex-col">
            <div className="font-mono text-base bg-[var(--color-graphite-2)] border border-[var(--color-rule-soft)] p-6 md:p-8 space-y-2">
              <div className="text-[var(--color-fg-quiet)]"># install on macos / linux / wsl</div>
              <div className="text-[var(--color-cream-on-graphite)]">{installCmd}</div>
              <div className="text-[var(--color-amber-text)]">
                agiworkforce exec &quot;your first task&quot;
              </div>
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="self-start font-mono text-xs tracking-[0.18em] uppercase border border-[var(--color-rule-soft)] hover:border-[var(--color-rule)] px-4 py-2 mt-3 text-[var(--color-cream-on-graphite)] transition-colors duration-150 cursor-pointer"
              aria-label={copied ? 'Install command copied' : 'Copy install command'}
            >
              {copied ? '[ copied ]' : '[ copy ]'}
            </button>
            {/* Screen-reader live region */}
            <span aria-live="polite" className="sr-only">
              {copied ? 'Install command copied' : ''}
            </span>
          </div>
        </div>

        {/* Colophon strip */}
        <div className="mt-12 border-t border-[var(--color-rule-soft)] pt-6">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-quiet)] text-center">
            SET IN NEWSREADER &amp; JETBRAINS MONO · BUILT BY AGI AUTOMATION LLC · NO TRAINING ON
            YOUR DATA · 2026
          </p>
        </div>
      </div>

      {/* Hairline rule at the bottom */}
      <div className="border-t border-[var(--color-rule-soft)]" />
    </section>
  );
}
