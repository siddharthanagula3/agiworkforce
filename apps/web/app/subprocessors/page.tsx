import Link from 'next/link';
import type { Metadata } from 'next';
import { Database, Info } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Sub-processors | AGI Workforce',
  description:
    'List of third-party sub-processors used by AGI Workforce and the data they process.',
  alternates: { canonical: 'https://agiworkforce.com/subprocessors' },
};

const subprocessors = [
  {
    name: 'Vercel',
    purpose: 'Web application hosting and CDN',
    dataProcessed: 'Request metadata, logs, IP addresses',
    location: 'United States',
    userControlled: false,
  },
  {
    name: 'Supabase',
    purpose: 'Authentication, database, and real-time sync',
    dataProcessed: 'All customer account data, conversation history, settings',
    location: 'us-east-2 (AWS Virginia)',
    userControlled: false,
  },
  {
    name: 'Stripe',
    purpose: 'Payment processing and billing',
    dataProcessed: 'Payment metadata, billing contact info (no raw card numbers)',
    location: 'United States (global network)',
    userControlled: false,
  },
  {
    name: 'Fly.io',
    purpose: 'Signaling server (WebRTC session coordination)',
    dataProcessed: 'Ephemeral session signaling data; no message content stored',
    location: 'United States',
    userControlled: false,
  },
  {
    name: 'Anthropic',
    purpose: 'AI model inference (Claude models)',
    dataProcessed: 'Conversation messages sent to Claude — only when user enables Anthropic',
    location: 'United States',
    userControlled: true,
  },
  {
    name: 'OpenAI',
    purpose: 'AI model inference (GPT models)',
    dataProcessed: 'Conversation messages sent to GPT — only when user enables OpenAI',
    location: 'United States',
    userControlled: true,
  },
  {
    name: 'Google',
    purpose: 'AI model inference (Gemini models)',
    dataProcessed: 'Conversation messages sent to Gemini — only when user enables Google',
    location: 'United States',
    userControlled: true,
  },
];

export default function SubprocessorsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            {/* Disclaimer banner */}
            <div className="mx-auto mb-8 max-w-4xl rounded-md border border-[#555150]/40 bg-[#555150]/10 px-4 py-3 text-sm text-[#888480]">
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

            <div className="mx-auto max-w-4xl">
              <div className="mb-6 flex items-center gap-3">
                <Database className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Sub-processors</h1>
              </div>
              <p className="mb-8 text-[#888480]">
                AGI Workforce (operated by AGI Automation LLC) uses the following third-party
                vendors that may process customer data. We require all sub-processors to maintain
                appropriate security and privacy standards.
              </p>

              {/* Note on user-controlled */}
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#c8892a]/20 bg-[#c8892a]/5 p-4 text-sm text-[#888480]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#c8892a]" />
                <span>
                  Rows marked <strong className="text-[#c8892a]">user-controlled</strong> represent
                  providers the user activates with their own API key (BYOK). In BYOK mode, your
                  data goes directly to that provider under your account and their terms. AGI
                  Automation LLC does not act as a data processor for those calls.
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-[#1a1917]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1917] bg-black/50">
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        Sub-processor
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">Purpose</th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        Data processed
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">Location</th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subprocessors.map((sp, i) => (
                      <tr
                        key={sp.name}
                        className={`border-b border-[#1a1917] ${i % 2 === 0 ? 'bg-[#09090b]' : 'bg-black/30'}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#edebe8]">{sp.name}</td>
                        <td className="px-4 py-3 text-[#888480]">{sp.purpose}</td>
                        <td className="px-4 py-3 text-[#888480]">{sp.dataProcessed}</td>
                        <td className="px-4 py-3 text-[#888480]">{sp.location}</td>
                        <td className="px-4 py-3">
                          {sp.userControlled ? (
                            <span className="rounded-full border border-[#c8892a]/30 bg-[#c8892a]/10 px-2 py-0.5 text-xs text-[#c8892a]">
                              User-controlled
                            </span>
                          ) : (
                            <span className="rounded-full border border-[#1a1917] px-2 py-0.5 text-xs text-[#555150]">
                              Platform
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 space-y-3 text-sm text-[#888480]">
                <p>
                  This list is kept up to date when sub-processors are added or removed. Material
                  changes will be announced via our changelog or email notification.
                </p>
                <p>
                  Questions:{' '}
                  <a
                    href="mailto:privacy@agiworkforce.com"
                    className="text-[#c8892a] hover:underline"
                  >
                    privacy@agiworkforce.com
                  </a>
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <Link href="/dpa" className="text-[#c8892a] hover:underline">
                  DPA template
                </Link>
                <Link href="/privacy" className="text-[#c8892a] hover:underline">
                  Privacy Policy
                </Link>
                <Link href="/trust" className="text-[#c8892a] hover:underline">
                  Trust Center
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
