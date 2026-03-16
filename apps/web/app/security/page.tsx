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
    gradient: 'from-blue-500 to-blue-600',
    borderHover: 'hover:border-blue-500/50',
    iconColor: 'text-blue-400',
    bgGlow: 'bg-blue-500/10',
    features: [
      'API keys encrypted at rest with Argon2id key derivation + AES-256-GCM',
      'Keys stored in OS keychain or encrypted SQLCipher database — never plaintext',
    ],
    tagline: 'Industry-standard encryption for every credential',
  },
  {
    icon: Shield,
    title: 'ToolGuard Sandboxing',
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-500/50',
    iconColor: 'text-emerald-400',
    bgGlow: 'bg-emerald-500/10',
    features: [
      'Every tool execution validated through ToolGuard before reaching your system',
      'Per-tool permission model with deny-list enforcement (1778-line security layer)',
    ],
    tagline: 'No unauthorized action reaches your system',
  },
  {
    icon: Key,
    title: 'BYOK — Bring Your Own Keys',
    gradient: 'from-purple-500 to-violet-600',
    borderHover: 'hover:border-purple-500/50',
    iconColor: 'text-purple-400',
    bgGlow: 'bg-purple-500/10',
    features: [
      'Your API calls go directly to the provider — we never proxy them',
      'Zero markup, zero interception — you own your AI relationship',
    ],
    tagline: 'Your keys stay yours, always',
  },
  {
    icon: Database,
    title: 'Supabase RLS + SQLCipher',
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-500/50',
    iconColor: 'text-orange-400',
    bgGlow: 'bg-orange-500/10',
    features: [
      'Row Level Security ensures users can only access their own data',
      'Local SQLite encrypted via SQLCipher — data at rest fully protected',
    ],
    tagline: 'Isolated data access at every layer',
  },
  {
    icon: Eye,
    title: 'Privacy First',
    gradient: 'from-cyan-500 to-teal-600',
    borderHover: 'hover:border-cyan-500/50',
    iconColor: 'text-cyan-400',
    bgGlow: 'bg-cyan-500/10',
    features: [
      'We never sell or share your data with third parties',
      'Request data export or deletion at any time — full GDPR compliance',
    ],
    tagline: 'Your data is yours, not ours',
  },
  {
    icon: Server,
    title: 'Infrastructure Security',
    gradient: 'from-pink-500 to-rose-600',
    borderHover: 'hover:border-pink-500/50',
    iconColor: 'text-pink-400',
    bgGlow: 'bg-pink-500/10',
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
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: FileText,
    name: 'CCPA',
    status: 'Compliant',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: CheckCircle2,
    name: 'SOC 2 Type II',
    status: 'Infrastructure (Vercel + Supabase)',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
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
      'Enter your API keys once. They are immediately encrypted with Argon2id + AES-GCM and stored in your OS keychain — never on our servers.',
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
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <Shield className="mr-2 h-4 w-4" />
                Security & Privacy
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Your Data Is Protected
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Local-first encryption, sandboxed tool execution, zero data brokering — security is
                not an afterthought at AGI Workforce.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#features"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  See Security Features
                </Link>
              </div>
              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <span>Argon2id + AES-256-GCM</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>GDPR & CCPA Compliant</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>ToolGuard Sandboxing</span>
                </div>
              </div>
            </div>
          </section>

          {/* Security Features Grid */}
          <section id="features" className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <div className="mb-4 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                  <Zap className="mr-2 h-4 w-4" />
                  Security Features
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Defense in Depth
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Six independent security layers protecting your keys, data, and actions at every
                  level of the stack.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                {securityFeatures.map((feature) => (
                  <div
                    key={feature.title}
                    className={`group relative rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:scale-[1.02] ${feature.borderHover}`}
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl ${feature.bgGlow} opacity-0 transition-opacity group-hover:opacity-100 blur-xl pointer-events-none`}
                    />
                    <div className="flex items-start gap-5">
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}
                      >
                        <feature.icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
                        <ul className="mb-4 space-y-2">
                          {feature.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-zinc-400">
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
                  <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
                    <Shield className="mr-2 h-4 w-4" />
                    Compliance
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Standards We Meet
                  </h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {complianceItems.map((item) => (
                      <div
                        key={item.name}
                        className={`rounded-xl border ${item.border} ${item.bg} p-6 text-center`}
                      >
                        <item.icon className={`mx-auto mb-3 h-8 w-8 ${item.color}`} />
                        <div className="text-lg font-bold text-white">{item.name}</div>
                        <div className={`mt-1 text-sm ${item.color}`}>{item.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-8">
                  <div className="mb-2 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                    <Lock className="mr-2 h-4 w-4" />
                    Security Practices
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How We Operate</h2>
                  <ul className="space-y-4">
                    {practices.map((practice) => (
                      <li key={practice} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                        <span className="text-zinc-400">{practice}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  How Your Data Is Protected
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  From the moment you enter a key to every action the AI takes.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {steps.map((step, index) => (
                  <div key={step.number} className="relative">
                    {index < steps.length - 1 && (
                      <div className="absolute right-0 top-12 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-blue-500/50 to-transparent md:block" />
                    )}
                    <div className="relative rounded-2xl border border-zinc-800 bg-black/50 p-8 text-center">
                      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700">
                        <step.icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="mb-2 text-sm font-bold text-blue-400">Step {step.number}</div>
                      <h3 className="mb-3 text-xl font-semibold">{step.title}</h3>
                      <p className="text-zinc-400 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Data Protection */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-10">
                <div className="mb-6 flex items-center gap-3">
                  <Shield className="h-6 w-6 text-emerald-500" />
                  <h2 className="text-2xl font-bold">Data Protection & Your Rights</h2>
                </div>
                <ul className="mb-8 space-y-4 text-zinc-400">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span>
                      <strong className="text-white">Data Ownership:</strong> You own all your data.
                      We never sell or share your data with third parties.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span>
                      <strong className="text-white">Right to Access:</strong> Request a copy of all
                      your data at any time.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span>
                      <strong className="text-white">Right to Deletion:</strong> Delete your account
                      and all associated data at any time.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span>
                      <strong className="text-white">Data Processing:</strong> All processing
                      happens within compliant infrastructure under your control.
                    </span>
                  </li>
                </ul>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/privacy"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                  >
                    <FileText className="h-4 w-4" />
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                  >
                    <FileText className="h-4 w-4" />
                    Terms of Service
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                  >
                    Contact Security Team
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <CtaSection
            icon={Shield}
            headline="Secure AI, From Day One"
            body="Download the desktop app and run AI with full local encryption, sandboxed tool execution, and zero data brokering — your keys, your data, your control."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
