import Link from 'next/link';
import type { Metadata } from 'next';
import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Service Level Agreement | AGI Workforce',
  description:
    'AGI Workforce uptime targets and credit schedules per tier. SLA applies to Hobby, Pro, Pro+, Max, and Enterprise.',
  alternates: { canonical: 'https://agiworkforce.com/sla' },
};

const tierSla = [
  {
    tier: 'Local-only',
    scope: 'Not applicable',
    uptime: 'N/A',
    credits: 'N/A',
    note: 'Runs entirely on your machine. No cloud infrastructure.',
  },
  {
    tier: 'BYOK Free',
    scope: 'Not applicable',
    uptime: 'N/A',
    credits: 'N/A',
    note: 'You route calls to your own provider accounts. No managed cloud.',
  },
  {
    tier: 'Hobby',
    scope: 'Managed cloud (web + API gateway)',
    uptime: '99.0% monthly',
    credits: 'See schedule below',
    note: 'Target, not yet auto-measured.',
  },
  {
    tier: 'Pro',
    scope: 'Managed cloud',
    uptime: '99.5% monthly',
    credits: 'See schedule below',
    note: 'Waitlist only. SLA activates when tier ships.',
  },
  {
    tier: 'Pro+',
    scope: 'Managed cloud + flagship daily caps',
    uptime: '99.5% monthly',
    credits: 'See schedule below',
    note: 'Waitlist only. SLA activates when tier ships.',
  },
  {
    tier: 'Max',
    scope: 'Managed cloud',
    uptime: '99.5% monthly',
    credits: 'See schedule below',
    note: 'Waitlist only. SLA activates when tier ships.',
  },
  {
    tier: 'Enterprise',
    scope: 'Managed cloud + dedicated support',
    uptime: '99.9% monthly',
    credits: 'Negotiated in MSA',
    note: 'Contact sales for terms.',
  },
];

const creditsSchedule = [
  { availability: '< 99.0% (Hobby) / < 99.5% (Pro / Pro+ / Max)', credit: '10% of monthly fee' },
  { availability: '< 95.0%', credit: '25% of monthly fee' },
  { availability: '< 90.0%', credit: '50% of monthly fee' },
];

const exclusions = [
  'Scheduled maintenance windows (announced 48 hours in advance via status page)',
  'Force majeure events (natural disasters, acts of war, government action)',
  'Third-party provider outages (e.g., Anthropic, OpenAI, Google model APIs)',
  'Local-only or BYOK free tier infrastructure (runs on user hardware)',
  'Issues caused by customer misconfiguration or abuse',
];

export default function SlaPage() {
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
                <Clock className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Service Level Agreement</h1>
              </div>

              {/* Honest disclaimer */}
              <div className="mb-8 flex items-start gap-3 rounded-xl border border-yellow-800/40 bg-yellow-900/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                <span className="text-yellow-200/80">
                  Uptime targets listed here are goals. Automated uptime measurement and SLA credit
                  tracking are on our roadmap. Until then, contact{' '}
                  <a
                    href="mailto:support@agiworkforce.com"
                    className="text-yellow-300 hover:underline"
                  >
                    support@agiworkforce.com
                  </a>{' '}
                  if you experience significant downtime.
                </span>
              </div>

              <p className="mb-8 text-[#888480] leading-relaxed">
                This SLA defines uptime commitments for paid tiers of AGI Workforce (Hobby, Pro,
                Max, Enterprise). Local-only and BYOK Free tiers are excluded because they do not
                use our managed cloud infrastructure.
              </p>

              {/* Tier table */}
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Per-tier commitments</h2>
              <div className="mb-10 overflow-x-auto rounded-xl border border-[#1a1917]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1917] bg-black/50">
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">Tier</th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        SLA scope
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        Uptime target
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierSla.map((row, i) => (
                      <tr
                        key={row.tier}
                        className={`border-b border-[#1a1917] ${i % 2 === 0 ? 'bg-[#09090b]' : 'bg-black/30'}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#edebe8]">{row.tier}</td>
                        <td className="px-4 py-3 text-[#888480]">{row.scope}</td>
                        <td
                          className={`px-4 py-3 font-medium ${row.uptime === 'N/A' ? 'text-[#555150]' : 'text-[#c8892a]'}`}
                        >
                          {row.uptime}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#555150]">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Credits */}
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">
                Service credits schedule
              </h2>
              <p className="mb-4 text-sm text-[#888480]">
                Applies to Hobby, Pro, and Max tiers. Enterprise credits are negotiated per MSA.
              </p>
              <div className="mb-10 overflow-x-auto rounded-xl border border-[#1a1917]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1917] bg-black/50">
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        Monthly availability
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[#edebe8]">
                        Service credit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditsSchedule.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-[#1a1917] ${i % 2 === 0 ? 'bg-[#09090b]' : 'bg-black/30'}`}
                      >
                        <td className="px-4 py-3 text-[#888480]">{row.availability}</td>
                        <td className="px-4 py-3 font-medium text-[#c8892a]">{row.credit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Exclusions */}
              <h2 className="mb-4 text-xl font-semibold text-[#edebe8]">Exclusions</h2>
              <ul className="mb-10 space-y-3">
                {exclusions.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[#888480]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#555150]" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <Link href="/status" className="text-[#c8892a] hover:underline">
                  Status page
                </Link>
                <Link href="/trust" className="text-[#c8892a] hover:underline">
                  Trust Center
                </Link>
                <Link href="/enterprise" className="text-[#c8892a] hover:underline">
                  Enterprise SLA
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
