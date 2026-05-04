import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Shield,
  Lock,
  Eye,
  Server,
  Key,
  CheckCircle2,
  FileText,
  Globe,
  Database,
  Zap,
  Play,
  Search,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { CtaSection } from '../../components/marketing/CtaSection';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Security & Privacy | AGI Workforce',
  description:
    'How AGI Workforce protects your data: local key storage, Argon2id encryption, AES-GCM at rest, ToolGuard sandboxing, Supabase RLS, and GDPR compliance.',
  keywords: [
    'security',
    'privacy',
    'data protection',
    'encryption',
    'GDPR',
    'API key security',
    'AGI Workforce',
  ],
  alternates: { canonical: 'https://agiworkforce.com/security' },
  openGraph: {
    title: 'Security & Privacy | AGI Workforce',
    description:
      'How AGI Workforce protects your data with local encryption, sandboxed tool execution, and zero data brokering.',
    url: 'https://agiworkforce.com/security',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce Security' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Security & Privacy | AGI Workforce',
    description: 'Local key encryption, ToolGuard sandboxing, and zero data brokering.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Security & Privacy - AGI Workforce',
  description:
    'How AGI Workforce protects your data with local encryption, sandboxed tool execution, and zero data brokering.',
  url: 'https://agiworkforce.com/security',
  isPartOf: {
    '@type': 'WebSite',
    '@id': 'https://agiworkforce.com/#website',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
  },
};

const securityFeatures = [
  {
    icon: Lock,
    title: 'Argon2id + AES-GCM Encryption',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'API keys encrypted at rest with Argon2id key derivation + AES-256-GCM',
      'Keys stored in OS keychain or encrypted SQLCipher database - never plaintext',
    ],
    tagline: 'Industry-standard encryption for every credential',
  },
  {
    icon: Shield,
    title: 'ToolGuard Sandboxing',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'Every tool execution validated through ToolGuard before reaching your system',
      'Per-tool permission model with deny-list enforcement (1778-line security layer)',
    ],
    tagline: 'No unauthorized action reaches your system',
  },
  {
    icon: Key,
    title: 'BYOK - Bring Your Own Keys',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'Your API calls go directly to the provider - we never proxy them',
      'Zero markup, zero interception - you own your AI relationship',
    ],
    tagline: 'Your keys stay yours, always',
  },
  {
    icon: Database,
    title: 'Supabase RLS + SQLCipher',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'Row Level Security ensures users can only access their own data',
      'Local SQLite encrypted via SQLCipher - data at rest fully protected',
    ],
    tagline: 'Isolated data access at every layer',
  },
  {
    icon: Eye,
    title: 'Privacy First',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'We never sell or share your data with third parties',
      'Request data export or deletion at any time - full GDPR compliance',
    ],
    tagline: 'Your data is yours, not ours',
  },
  {
    icon: Server,
    title: 'Infrastructure Security',
    borderHover: 'hover:border-[#c8892a]/50',
    iconColor: 'text-[#c8892a]',
    features: [
      'Web services hosted on Vercel + Supabase (both SOC 2 Type II certified)',
      'TLS 1.3 encryption in transit, DDoS protection, automated security scanning',
    ],
    tagline: 'Built on trusted, audited infrastructure',
  },
];

const complianceItems = [
  {
    icon: Globe,
    name: 'GDPR',
    status: 'Compliant',
    color: 'text-[#c8892a]',
    border: 'border-[#c8892a]/30',
    bg: 'bg-[#c8892a]/10',
  },
  {
    icon: FileText,
    name: 'CCPA',
    status: 'Compliant',
    color: 'text-[#c8892a]',
    border: 'border-[#c8892a]/30',
    bg: 'bg-[#c8892a]/10',
  },
  {
    icon: CheckCircle2,
    name: 'SOC 2 Type II',
    status: 'Infrastructure (Vercel + Supabase)',
    color: 'text-[#c8892a]',
    border: 'border-[#c8892a]/30',
    bg: 'bg-[#c8892a]/10',
  },
];

const practices = [
  'Internal security audits and code reviews',
  'Automated vulnerability scanning via CI/CD pipeline',
  'Secure code reviews with strict lint rules (no unsafe_code)',
  'Least privilege access controls throughout the stack',
  'Incident response procedures in place',
  'Data backup and disaster recovery procedures',
  'Multi-factor authentication supported',
  'Deep linking secured via allowlist and token redaction',
];

const steps = [
  {
    number: '01',
    icon: Lock,
    title: 'Keys Stay Local',
    description:
      'Enter your API keys once. They are immediately encrypted with Argon2id + AES-GCM and stored in your OS keychain - never on our servers.',
  },
  {
    number: '02',
    icon: Play,
    title: 'Every Action is Validated',
    description:
      'Before any tool runs, ToolGuard validates the action against your permission settings. You can review and approve sensitive operations.',
  },
  {
    number: '03',
    icon: Search,
    title: 'Full Audit Trail',
    description:
      'Every tool execution, agent action, and session is logged locally with timestamps. You have complete visibility into everything the AI did.',
  },
];

export default function SecurityPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
                <Shield className="mr-2 h-4 w-4" />
                Security & Privacy
              </div>
              <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight text-[#edebe8] md:text-7xl lg:text-8xl">
                Your Data Is Protected
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-[#888480] md:text-xl">
                Local-first encryption, sandboxed tool execution, zero data brokering - security is
                not an afterthought at AGI Workforce.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-[#c8892a] px-8 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#c8892a]/90 focus:outline-none focus:ring-2 focus:ring-[#c8892a] focus:ring-offset-2 focus:ring-offset-[#09090b]"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#features"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-[#555150]/40 bg-[#09090b] px-8 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                >
                  See Security Features
                </Link>
              </div>
              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-[#888480]">
                  <Zap className="h-4 w-4 text-[#c8892a]" />
                  <span>Argon2id + AES-256-GCM</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#888480]">
                  <CheckCircle2 className="h-4 w-4 text-[#c8892a]" />
                  <span>GDPR & CCPA Compliant</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#888480]">
                  <Shield className="h-4 w-4 text-[#c8892a]" />
                  <span>ToolGuard Sandboxing</span>
                </div>
              </div>
            </div>
          </section>

          {/* Security Features Grid */}
          <section id="features" className="bg-[#09090b] py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <div className="mb-4 inline-flex items-center rounded-md border border-[#c8892a]/30 bg-[#c8892a]/10 px-3 py-1 text-sm text-[#c8892a]">
                  <Zap className="mr-2 h-4 w-4" />
                  Security Features
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
                  Defense in Depth
                </h2>
                <p className="mx-auto max-w-2xl text-[#888480]">
                  Six independent security layers protecting your keys, data, and actions at every
                  level of the stack.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                {securityFeatures.map((feature) => (
                  <div
                    key={feature.title}
                    className={`group relative rounded-2xl border border-[#1a1917] bg-black/50 p-8 transition-all hover:scale-[1.02] ${feature.borderHover}`}
                  >
                    <div className="flex items-start gap-5">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#c8892a]/15 border border-[#c8892a]/30">
                        <feature.icon className="h-7 w-7 text-[#c8892a]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-3 text-xl font-semibold text-[#edebe8]">
                          {feature.title}
                        </h3>
                        <ul className="mb-4 space-y-2">
                          {feature.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-[#888480]">
                              <CheckCircle2
                                className={`mt-0.5 h-4 w-4 shrink-0 ${feature.iconColor}`}
                              />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        <p className={`text-sm font-medium ${feature.iconColor}`}>
                          {feature.tagline}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Compliance + Practices */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-start gap-16 lg:flex-row">
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-md border border-[#c8892a]/30 bg-[#c8892a]/10 px-3 py-1 text-sm text-[#c8892a]">
                    <Shield className="mr-2 h-4 w-4" />
                    Compliance
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
                    Standards We Meet
                  </h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {complianceItems.map((item) => (
                      <div
                        key={item.name}
                        className={`rounded-xl border ${item.border} ${item.bg} p-6 text-center`}
                      >
                        <item.icon className={`mx-auto mb-3 h-8 w-8 ${item.color}`} />
                        <div className="text-lg font-bold text-[#edebe8]">{item.name}</div>
                        <div className={`mt-1 text-sm ${item.color}`}>{item.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-md border border-[#c8892a]/30 bg-[#c8892a]/10 px-3 py-1 text-sm text-[#c8892a]">
                    <Lock className="mr-2 h-4 w-4" />
                    Security Practices
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
                    How We Operate
                  </h2>
                  <ul className="space-y-4">
                    {practices.map((practice) => (
                      <li key={practice} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                        <span className="text-[#888480]">{practice}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-[#09090b] py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-[#edebe8] md:text-4xl">
                  How Your Data Is Protected
                </h2>
                <p className="mx-auto max-w-2xl text-[#888480]">
                  From the moment you enter a key to every action the AI takes.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {steps.map((step, index) => (
                  <div key={step.number} className="relative">
                    {index < steps.length - 1 && (
                      <div className="absolute right-0 top-12 hidden h-px w-full translate-x-1/2 bg-[#c8892a]/30 md:block" />
                    )}
                    <div className="relative rounded-2xl border border-[#1a1917] bg-black/50 p-8 text-center">
                      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#c8892a]/15 border border-[#c8892a]/30">
                        <step.icon className="h-7 w-7 text-[#c8892a]" />
                      </div>
                      <div className="mb-2 text-sm font-bold text-[#c8892a]">
                        Step {step.number}
                      </div>
                      <h3 className="mb-3 text-xl font-semibold text-[#edebe8]">{step.title}</h3>
                      <p className="text-[#888480] leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Data Protection */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl rounded-2xl border border-[#1a1917] bg-[#09090b] p-10">
                <div className="mb-6 flex items-center gap-3">
                  <Shield className="h-6 w-6 text-[#c8892a]" />
                  <h2 className="text-2xl font-bold text-[#edebe8]">
                    Data Protection & Your Rights
                  </h2>
                </div>
                <ul className="mb-8 space-y-4 text-[#888480]">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <span>
                      <strong className="text-[#edebe8]">Data Ownership:</strong> You own all your
                      data. We never sell or share your data with third parties.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <span>
                      <strong className="text-[#edebe8]">Right to Access:</strong> Request a copy of
                      all your data at any time.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <span>
                      <strong className="text-[#edebe8]">Right to Deletion:</strong> Delete your
                      account and all associated data at any time.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <span>
                      <strong className="text-[#edebe8]">Data Processing:</strong> All processing
                      happens within compliant infrastructure under your control.
                    </span>
                  </li>
                </ul>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/privacy"
                    className="inline-flex items-center gap-2 rounded-md border border-[#555150]/40 bg-[#09090b] px-6 py-2.5 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    <FileText className="h-4 w-4" />
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="inline-flex items-center gap-2 rounded-md border border-[#555150]/40 bg-[#09090b] px-6 py-2.5 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    <FileText className="h-4 w-4" />
                    Terms of Service
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-md border border-[#555150]/40 bg-[#09090b] px-6 py-2.5 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                  >
                    Contact Security Team
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <CtaSection
            icon="Shield"
            headline="Secure AI, From Day One"
            body="Download the desktop app and run AI with full local encryption, sandboxed tool execution, and zero data brokering - your keys, your data, your control."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
