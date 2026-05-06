import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Shield,
  Lock,
  Eye,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Globe,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Trust Center | AGI Workforce',
  description:
    'AGI Workforce trust center: security posture, compliance roadmap, privacy practices, and legal documents in one place.',
  alternates: { canonical: 'https://agiworkforce.com/trust' },
};

const trustLinks = [
  {
    href: '/security',
    icon: Shield,
    label: 'Security',
    description: 'Encryption, sandboxing, BYOK key handling, and infrastructure controls.',
  },
  {
    href: '/privacy',
    icon: Eye,
    label: 'Privacy Policy',
    description: 'What data we collect, how we use it, and your rights under GDPR and CCPA.',
  },
  {
    href: '/terms',
    icon: FileText,
    label: 'Terms of Service',
    description: 'Terms governing your use of AGI Workforce.',
  },
  {
    href: '/subprocessors',
    icon: Database,
    label: 'Sub-processors',
    description: 'Every third-party vendor that touches your data.',
  },
  {
    href: '/dpa',
    icon: Globe,
    label: 'DPA',
    description: 'Data Processing Agreement template for GDPR-subject customers.',
  },
  {
    href: '/sla',
    icon: CheckCircle2,
    label: 'SLA',
    description: 'Uptime targets and credit schedules per tier.',
  },
  {
    href: '/accessibility',
    icon: Lock,
    label: 'Accessibility',
    description: 'Our WCAG 2.1 AA commitment and known gaps.',
  },
];

const securityHighlights = [
  'API keys encrypted at rest with Argon2id + AES-256-GCM, stored in OS keychain or encrypted SQLCipher DB.',
  'ToolGuard sandbox: every tool execution validated before reaching your system.',
  "Supabase Row Level Security on all tables. Users cannot access other users' data.",
  'BYOK: your API keys route directly to the provider. We never proxy them.',
  'TLS 1.3 in transit. DDoS protection via Vercel and Fly.io.',
  'Internal security audits ongoing. P0 findings: 13 of 14 closed as of 2026-05-05.',
];

const complianceRoadmap = [
  {
    label: 'SOC 2 Type II',
    status: 'In Progress',
    color: 'text-yellow-400',
    border: 'border-yellow-800/40',
    bg: 'bg-yellow-900/10',
    note: 'Audit initiated. Certification not yet complete. Our infrastructure providers (Vercel, Supabase) hold SOC 2 Type II.',
  },
  {
    label: 'GDPR',
    status: 'DPA Available',
    color: 'text-emerald-400',
    border: 'border-emerald-800/40',
    bg: 'bg-emerald-900/10',
    note: 'We maintain a DPA template for customers subject to GDPR. Request via sales or download at /dpa.',
  },
  {
    label: 'HIPAA BAA',
    status: 'On Request',
    color: 'text-[#c8892a]',
    border: 'border-[#c8892a]/30',
    bg: 'bg-[#c8892a]/5',
    note: 'BAA available for qualifying enterprise customers on annual contracts. We are not HIPAA-certified.',
  },
  {
    label: 'ISO 27001',
    status: 'Planned',
    color: 'text-[#888480]',
    border: 'border-[#1a1917]',
    bg: 'bg-black/50',
    note: 'On our compliance roadmap. No timeline committed yet.',
  },
];

export default function TrustPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Shield className="mr-2 h-4 w-4" />
              Trust Center
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              Security, privacy, and compliance in one place.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[#888480]">
              We document our posture honestly, including what we have not yet completed. No
              marketing puffery.
            </p>
          </div>
        </section>

        {/* Honest Audit Disclosure */}
        <section className="pb-6">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl rounded-xl border border-yellow-800/40 bg-yellow-900/10 px-6 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
                <div className="text-sm text-yellow-200/80">
                  <strong className="text-yellow-300">Audit status as of 2026-05-05:</strong> P0
                  security findings: 13 of 14 closed. P1 findings: 20 of 25 closed. Remaining open
                  items: CLI auth.json (mitigated, 0o600 permissions), DESK-5, DESK-8, WEB-5,
                  WEB-11. We are actively working through them.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Document Links */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">Key documents</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {trustLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-start gap-4 rounded-xl border border-[#1a1917] bg-black/50 p-5 transition-colors hover:border-[#c8892a]/30 hover:bg-[#c8892a]/5"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                      <item.icon className="h-4 w-4 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2 font-semibold text-[#edebe8]">
                        {item.label}
                        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 text-[#c8892a]" />
                      </div>
                      <p className="text-sm text-[#888480]">{item.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Security Summary */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">
                Security posture summary
              </h2>
              <div className="rounded-xl border border-[#1a1917] bg-[#09090b] p-6">
                <ul className="space-y-3">
                  {securityHighlights.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#888480]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#c8892a]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link
                    href="/security"
                    className="inline-flex items-center gap-2 text-sm text-[#c8892a] hover:underline"
                  >
                    Full security page
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Compliance Roadmap */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-2 text-xl font-semibold text-[#edebe8]">Compliance roadmap</h2>
              <p className="mb-6 text-sm text-[#888480]">
                We list the honest status of each framework. "In progress" means audit initiated but
                not certified. We do not claim certifications we do not hold.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {complianceRoadmap.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-xl border ${item.border} ${item.bg} p-5`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-[#edebe8]">{item.label}</span>
                      <span className={`text-sm font-medium ${item.color}`}>{item.status}</span>
                    </div>
                    <p className="text-sm text-[#888480]">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-3 text-xl font-bold text-[#edebe8]">
              Questions about our security or compliance?
            </h2>
            <p className="mb-6 text-sm text-[#888480]">
              Contact our team directly. We respond to all security and compliance inquiries.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-[#c8892a] px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
              >
                Contact Us
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/enterprise"
                className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] bg-black/50 px-6 py-2.5 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
              >
                Enterprise Info
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
