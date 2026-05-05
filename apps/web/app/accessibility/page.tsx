import Link from 'next/link';
import type { Metadata } from 'next';
import { Eye, CheckCircle2, AlertTriangle, Keyboard, Monitor } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Accessibility | AGI Workforce',
  description:
    'AGI Workforce accessibility statement. WCAG 2.1 AA target, known gaps, and how to report barriers.',
  alternates: { canonical: 'https://agiworkforce.com/accessibility' },
};

const commitments = [
  {
    icon: Keyboard,
    title: 'Keyboard navigation',
    description:
      'All interactive elements are reachable and operable by keyboard. Tab order follows visual reading order.',
  },
  {
    icon: Monitor,
    title: 'Screen reader support',
    description:
      'We use semantic HTML, ARIA labels, and live regions for dynamic content. Tested with VoiceOver and NVDA.',
  },
  {
    icon: Eye,
    title: 'Color contrast',
    description:
      'Text meets WCAG 2.1 AA minimum contrast ratios (4.5:1 for normal text, 3:1 for large text). Accent color #c8892a on dark backgrounds meets AA.',
  },
  {
    icon: CheckCircle2,
    title: 'Focus indicators',
    description:
      'Visible focus rings on all interactive elements. We do not suppress default browser focus outlines without providing a custom replacement.',
  },
];

const knownGaps = [
  'A full third-party accessibility audit has not been completed. Some edge cases may exist.',
  'Some data-dense tables in the chat surface may not have complete ARIA headers.',
  'Complex markdown rendering (code blocks, LaTeX) may have partial screen reader support.',
  'Mobile surfaces are in active development; accessibility review is in progress.',
];

export default function AccessibilityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            {/* Disclaimer banner */}
            <div className="mx-auto mb-8 max-w-3xl rounded-md border border-[#555150]/40 bg-[#555150]/10 px-4 py-3 text-sm text-[#888480]">
              <strong className="text-[#edebe8]">Informational document.</strong> This document
              supplements our{' '}
              <Link href="/terms" className="text-[#c8892a] hover:underline">
                /terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-[#c8892a] hover:underline">
                /privacy
              </Link>
              . Last updated: 2026-05-05.
            </div>

            <div className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center gap-3">
                <Eye className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Accessibility Statement</h1>
              </div>

              <p className="mb-4 text-[#888480] leading-relaxed">
                AGI Automation LLC is committed to making AGI Workforce accessible to people with
                disabilities. Our target is WCAG 2.1 Level AA conformance.
              </p>

              {/* Honest disclaimer */}
              <div className="mb-8 flex items-start gap-3 rounded-xl border border-yellow-800/40 bg-yellow-900/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                <span className="text-yellow-200/80">
                  We follow WCAG 2.1 AA as a target. We have not completed a full third-party
                  accessibility audit. If you encounter barriers, please contact us at{' '}
                  <a
                    href="mailto:accessibility@agiworkforce.com"
                    className="text-yellow-300 hover:underline"
                  >
                    accessibility@agiworkforce.com
                  </a>
                  .
                </span>
              </div>

              {/* Standard */}
              <div className="mb-8 rounded-xl border border-[#1a1917] bg-black/50 p-5">
                <h2 className="mb-2 font-semibold text-[#edebe8]">Conformance target</h2>
                <p className="text-sm text-[#888480]">
                  We target conformance with the{' '}
                  <a
                    href="https://www.w3.org/TR/WCAG21/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c8892a] hover:underline"
                  >
                    Web Content Accessibility Guidelines (WCAG) 2.1
                  </a>{' '}
                  at Level AA. This applies to the AGI Workforce web application at
                  agiworkforce.com.
                </p>
              </div>

              {/* Commitments */}
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">Our commitments</h2>
              <div className="mb-10 grid gap-4 sm:grid-cols-2">
                {commitments.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-[#1a1917] bg-[#09090b] p-5"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                      <item.icon className="h-4 w-4 text-[#c8892a]" />
                    </div>
                    <h3 className="mb-1 font-semibold text-[#edebe8]">{item.title}</h3>
                    <p className="text-sm text-[#888480]">{item.description}</p>
                  </div>
                ))}
              </div>

              {/* Known gaps */}
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Known gaps</h2>
              <ul className="mb-8 space-y-3">
                {knownGaps.map((gap) => (
                  <li key={gap} className="flex items-start gap-3 text-sm text-[#888480]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                    {gap}
                  </li>
                ))}
              </ul>

              {/* Contact */}
              <div className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6">
                <h2 className="mb-3 font-semibold text-[#edebe8]">Report a barrier</h2>
                <p className="mb-4 text-sm text-[#888480]">
                  If you experience an accessibility barrier or have a request related to
                  accessibility, please contact us. We aim to respond within 3 business days.
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    href="mailto:accessibility@agiworkforce.com"
                    className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
                  >
                    accessibility@agiworkforce.com
                  </a>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-4 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    Contact form
                  </Link>
                </div>
              </div>

              <p className="mt-6 text-xs text-[#555150]">
                This statement was last reviewed on 2026-05-05. We review and update this statement
                annually or when significant changes are made to our platform.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
