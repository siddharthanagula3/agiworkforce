import Link from 'next/link';
import type { Metadata } from 'next';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Refund Policy | AGI Workforce',
  description:
    'AGI Workforce refund policy. Hobby 7-day prorated refund. Pro/Max/Enterprise: contact billing.',
  alternates: { canonical: 'https://agiworkforce.com/refund-policy' },
};

const tiers = [
  {
    tier: 'Local-only (Free)',
    policy: 'No charge, no refund needed.',
    detail: 'Local-only is permanently free. There is nothing to refund.',
    color: 'text-[#888480]',
  },
  {
    tier: 'BYOK (Free)',
    policy: 'No charge, no refund needed.',
    detail: 'BYOK is permanently free. You pay your AI providers directly, not us.',
    color: 'text-[#888480]',
  },
  {
    tier: 'Hobby',
    policy: 'Prorated refund within 7 days of charge.',
    detail:
      'If you request a refund within 7 days of a Hobby billing date, we will issue a prorated refund for the remaining days. After 7 days, no refund is issued for that billing period.',
    color: 'text-[#c8892a]',
  },
  {
    tier: 'Pro (waitlist)',
    policy: 'Contact billing at billing@agiworkforce.com.',
    detail:
      'Pro is currently waitlist-only. Billing terms will be published when Pro ships. Existing charges: contact billing.',
    color: 'text-[#888480]',
  },
  {
    tier: 'Max (waitlist)',
    policy: 'Contact billing at billing@agiworkforce.com.',
    detail:
      'Max is currently waitlist-only. Billing terms will be published when Max ships. Existing charges: contact billing.',
    color: 'text-[#888480]',
  },
  {
    tier: 'Enterprise',
    policy: 'See your contract / MSA.',
    detail:
      'Enterprise refunds and cancellation terms are defined in your Master Service Agreement. Contact your account manager for assistance.',
    color: 'text-[#888480]',
  },
];

const steps = [
  'Email billing@agiworkforce.com from the address associated with your account.',
  'Include your order ID or the last 4 digits of the Stripe charge.',
  'Include the reason for your refund request (optional but helpful).',
  'We will confirm receipt within 1 business day and process eligible refunds within 5-10 business days.',
  'Funds return to your original payment method via Stripe. Timing depends on your card issuer.',
];

export default function RefundPolicyPage() {
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
                <CreditCard className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Refund Policy</h1>
              </div>

              <p className="mb-8 text-[#888480] leading-relaxed">
                Our refund policy is designed to be fair and transparent. Payments are processed via
                Stripe. This policy applies to all AGI Workforce subscription tiers.
              </p>

              {/* Tier table */}
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">Per-tier policy</h2>
              <div className="mb-10 space-y-3">
                {tiers.map((row) => (
                  <div
                    key={row.tier}
                    className="rounded-xl border border-[#1a1917] bg-black/50 p-5"
                  >
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-[#edebe8]">{row.tier}</span>
                      <span className={`text-sm font-medium ${row.color}`}>{row.policy}</span>
                    </div>
                    <p className="text-sm text-[#888480]">{row.detail}</p>
                  </div>
                ))}
              </div>

              {/* Note on Stripe-alignment */}
              <div className="mb-10 flex items-start gap-3 rounded-xl border border-[#1a1917] bg-[#09090b] p-5 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <span className="text-[#888480]">
                  Stripe charges are final once processed. Refunds are issued as credits to your
                  original payment method and may take 5-10 business days depending on your card
                  issuer or bank.
                </span>
              </div>

              {/* Process */}
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">How to request a refund</h2>
              <ol className="mb-10 space-y-4">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c8892a]/10 border border-[#c8892a]/30 text-xs font-bold text-[#c8892a]">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm text-[#888480]">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6">
                <h2 className="mb-3 font-semibold text-[#edebe8]">Billing contact</h2>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="mailto:billing@agiworkforce.com"
                    className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
                  >
                    billing@agiworkforce.com
                  </a>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-4 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    Contact form
                  </Link>
                </div>
                <p className="mt-3 text-xs text-[#555150]">
                  We aim to respond to all billing inquiries within 1 business day.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <Link href="/pricing" className="text-[#c8892a] hover:underline">
                  Pricing
                </Link>
                <Link href="/terms" className="text-[#c8892a] hover:underline">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
