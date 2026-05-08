import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Shield,
  Users,
  Key,
  FileText,
  Zap,
  Globe,
  Lock,
  CheckCircle2,
  ArrowRight,
  Building2,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Enterprise | AGI Workforce',
  description:
    'Enterprise-grade AI for teams that need control. SSO, SCIM, audit logs, custom data retention, dedicated support, and BYOK enforcement.',
  alternates: { canonical: 'https://agiworkforce.com/enterprise' },
};

const enterpriseFeatures = [
  {
    icon: Shield,
    title: 'SSO (SAML / OIDC)',
    description:
      'Connect your existing identity provider. Supports Okta, Azure AD, Google Workspace, and any SAML 2.0 or OIDC-compliant IdP.',
  },
  {
    icon: Users,
    title: 'SCIM Provisioning',
    description:
      'Automate user and group provisioning. Add and remove seats through your IdP without manual intervention.',
  },
  {
    icon: FileText,
    title: 'Audit Log Export',
    description:
      'Full structured audit log of every model call, tool execution, and user action. Export to your SIEM or data warehouse.',
  },
  {
    icon: Lock,
    title: 'Custom Data Retention',
    description:
      'Set organization-level retention windows. Purge conversation history on your schedule, not ours.',
  },
  {
    icon: Key,
    title: 'BYOK Enforcement',
    description:
      'Enforce Bring-Your-Own-Keys across your org. No managed cloud credits consumed unless you choose it.',
  },
  {
    icon: Globe,
    title: 'Regional Data Residency',
    description:
      'Data residency on request for enterprise contracts. Default region is us-east-2 (Supabase). EU residency available on roadmap.',
  },
  {
    icon: Zap,
    title: 'Dedicated Support',
    description:
      'Named support contact, SLA-backed response times, and Slack Connect channel for your team.',
  },
  {
    icon: Building2,
    title: 'Custom MSA',
    description:
      'Negotiate a Master Service Agreement tailored to your legal and procurement requirements.',
  },
];

const complianceBadges = [
  {
    label: 'SOC 2 Type II',
    status: 'In Progress',
    note: 'Audit initiated. Certification pending.',
  },
  {
    label: 'GDPR',
    status: 'DPA Available',
    note: 'Data Processing Agreement available on request.',
  },
  {
    label: 'HIPAA BAA',
    status: 'On Request',
    note: 'BAA available for qualifying enterprise customers. Not HIPAA-certified.',
  },
  { label: 'ISO 27001', status: 'Planned', note: 'On the compliance roadmap.' },
];

const tiers = [
  {
    name: 'Hobby',
    price: '$10/mo',
    features: ['Managed cloud', 'Limited credits', 'Basic models'],
    cta: 'Join Waitlist',
    href: '/pricing',
    note: null,
  },
  {
    name: 'Pro',
    price: 'TBD',
    features: ['Higher token caps', 'Priority queue', 'All models'],
    cta: 'Join Waitlist',
    href: '/pricing',
    note: 'Waitlist',
  },
  {
    name: 'Max',
    price: 'TBD',
    features: ['Highest caps', 'Fastest queue', 'Advanced features'],
    cta: 'Join Waitlist',
    href: '/pricing',
    note: 'Waitlist',
  },
  {
    name: 'Enterprise',
    price: 'Contact Sales',
    features: ['SSO + SCIM', 'Audit logs', 'Custom MSA', 'Dedicated support'],
    cta: 'Talk to Sales',
    href: '/contact-sales',
    note: null,
    highlight: true,
  },
];

export default function EnterprisePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Building2 className="mr-2 h-4 w-4" />
              Enterprise
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-6xl">
              Enterprise-grade AI for teams that need control.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[#888480]">
              {MARKETING.providers.display} providers, {MARKETING.surfaces.display} surfaces, one
              unified platform. With the access controls, auditability, and support your
              organization requires.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/contact-sales"
                className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
              >
                Talk to Sales
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/trust"
                className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] bg-black/50 px-8 py-3 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
              >
                View Trust Center
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-black py-20">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-[#edebe8] md:text-3xl">
              Everything your enterprise needs
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {enterpriseFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6 transition-colors hover:border-[#c8892a]/30"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                    <feature.icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <h3 className="mb-2 font-semibold text-[#edebe8]">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tier Comparison */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-[#edebe8] md:text-3xl">
              Compare plans
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-xl border p-6 ${
                    tier.highlight
                      ? 'border-[#c8892a]/50 bg-[#c8892a]/5'
                      : 'border-[#1a1917] bg-black/50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-bold text-[#edebe8]">{tier.name}</h3>
                    {tier.note && (
                      <span className="rounded-full border border-[#555150]/40 px-2 py-0.5 text-xs text-[#888480]">
                        {tier.note}
                      </span>
                    )}
                  </div>
                  <p
                    className={`mb-4 text-sm font-medium ${tier.highlight ? 'text-[#c8892a]' : 'text-[#888480]'}`}
                  >
                    {tier.price}
                  </p>
                  <ul className="mb-6 space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#888480]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={tier.href}
                    className={`block w-full rounded-md py-2 text-center text-sm font-medium transition-colors ${
                      tier.highlight
                        ? 'bg-[#c8892a] text-black hover:bg-[#c8892a]/90'
                        : 'border border-[#1a1917] text-[#888480] hover:bg-[#1a1917] hover:text-[#edebe8]'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-[#555150]">
              Annual contracts available. Volume discounts apply. Pro and Max are currently
              waitlist-only.
            </p>
          </div>
        </section>

        {/* Compliance */}
        <section className="bg-black py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-3 text-center text-2xl font-bold text-[#edebe8]">
                Compliance posture
              </h2>
              <p className="mb-8 text-center text-sm text-[#888480]">
                Honest status as of 2026-05-05. We do not claim certifications we have not
                completed.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {complianceBadges.map((badge) => (
                  <div
                    key={badge.label}
                    className="rounded-xl border border-[#1a1917] bg-[#09090b] p-5"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-[#edebe8]">{badge.label}</span>
                      <span className="rounded-full border border-[#555150]/40 px-2 py-0.5 text-xs text-[#c8892a]">
                        {badge.status}
                      </span>
                    </div>
                    <p className="text-sm text-[#888480]">{badge.note}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
                <Link href="/subprocessors" className="text-[#c8892a] hover:underline">
                  Sub-processor list
                </Link>
                <Link href="/dpa" className="text-[#c8892a] hover:underline">
                  DPA template
                </Link>
                <Link href="/sla" className="text-[#c8892a] hover:underline">
                  SLA terms
                </Link>
                <Link href="/trust" className="text-[#c8892a] hover:underline">
                  Trust center
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-4 text-2xl font-bold text-[#edebe8]">Ready to talk?</h2>
            <p className="mb-8 text-[#888480]">
              Annual contracts, volume discounts, and custom MSA available.
            </p>
            <Link
              href="/contact-sales"
              className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
            >
              Talk to Sales
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
