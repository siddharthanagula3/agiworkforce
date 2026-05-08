import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Smartphone,
  Bell,
  Shield,
  Wifi,
  Send,
  Eye,
  Lock,
  Layers,
  Monitor,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Mobile App | AGI Workforce',
  description:
    'AGI Workforce mobile companion. Dispatch tasks to your desktop, watch them complete in real time. Expo + React Native, 43 screens. Coming to App Store and Google Play.',
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
  openGraph: {
    title: 'Mobile App | AGI Workforce',
    description:
      'AI in your pocket. Dispatch to your desktop. Expo + React Native mobile companion.',
    url: 'https://agiworkforce.com/mobile',
    type: 'website',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce Mobile' }],
  },
};

const features = [
  {
    icon: Send,
    title: 'Dispatch to Desktop',
    desc: 'Send a task from your phone, watch it execute on your desktop agent in real time. Full Dispatch parity with Anthropic Dispatch. Cross-device only in Cloud mode.',
  },
  {
    icon: Monitor,
    title: 'Live Agent Dashboard',
    desc: 'Monitor running agents from anywhere. See progress, tool calls, and completions as they happen over Supabase Realtime.',
  },
  {
    icon: Lock,
    title: 'MMKV + Biometric Storage',
    desc: 'API keys protected by MMKV + biometric authentication + secure storage chain. Your credentials never leave the device unencrypted.',
  },
  {
    icon: Shield,
    title: 'BYOK + Cloud',
    desc: 'Bring your own API keys or use a Hobby cloud subscription. Local mode (Ollama/LM Studio) is desktop-only, not mobile.',
  },
  {
    icon: Layers,
    title: '43 Screens',
    desc: 'Full chat, settings, onboarding, skills browser, conversation history, and more. Drawer navigation with tab compatibility retained.',
  },
  {
    icon: Wifi,
    title: 'Cross-Device Sync',
    desc: 'Start a conversation on web, continue on mobile, dispatch heavy tasks to desktop. All threads stay in sync via Supabase (Cloud mode only).',
  },
  {
    icon: Eye,
    title: MARKETING.providers.display + ' Providers',
    desc: 'Same provider lineup as desktop and web. Switch models per conversation. Economy models on Hobby, balanced on Pro, flagship (Opus 4.7 / GPT-5.5) on Pro+/Max with daily caps.',
  },
  {
    icon: Bell,
    title: 'Push Notifications',
    desc: 'Get notified when a dispatched agent completes, or when a long-running task needs attention. Notification infrastructure ready.',
  },
];

const techFacts = [
  { label: 'Framework', value: 'Expo + React Native' },
  { label: 'Screens', value: '43' },
  { label: 'Navigation', value: 'Drawer (tabs retained)' },
  { label: 'iOS bundle ID', value: 'com.agiworkforce.app' },
  { label: 'iOS min version', value: '~15.1 (SDK-derived)' },
  { label: 'Storage', value: 'MMKV + biometric + SecureStore' },
  { label: 'Realtime', value: 'Supabase Realtime' },
  { label: 'Build profiles', value: 'dev / preview / prod' },
];

export default function MobilePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8892a]/[0.07] blur-[140px]" />

          <div className="container mx-auto px-4 relative">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8892a]/25 bg-[#c8892a]/[0.07] px-4 py-1.5 text-sm font-medium text-[#c8892a] mb-8">
                <Smartphone className="h-3.5 w-3.5" />
                Expo + React Native — iOS and Android
              </div>

              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                AI in your pocket.
                <br />
                <span className="bg-gradient-to-r from-[#c8892a] via-[#e8af50] to-[#c8892a] bg-clip-text text-transparent">
                  Dispatch to desktop.
                </span>
              </h1>

              <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
                Chat, monitor agents, and send tasks from anywhere. Your desktop does the heavy
                lifting.
              </p>

              {/* Honest status banner */}
              <div className="inline-flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300 mb-10 text-left max-w-xl">
                <Bell className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Status:</strong> Expo build profiles are ready (dev/preview/prod). App
                  Store and Google Play listings are not yet live. Sign up to be notified at launch.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/contact"
                  className="group inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black transition-all hover:bg-[#d4993a]"
                >
                  Notify me on launch
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/desktop"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-8 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-white transition-all"
                >
                  Try Desktop now
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What Dispatch means */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                The Dispatch model
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Phone as commander. Desktop as agent.
              </h2>
              <p className="text-zinc-400">
                Dispatch is a task handoff protocol between mobile and desktop. Tap on your phone,
                your desktop executes autonomously, you watch it complete in real time.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              {[
                {
                  step: '01',
                  title: 'Send from mobile',
                  desc: 'Tap a task from your phone: "Research competitors and draft a report," "Fix the failing tests in my repo," or any other agent task.',
                },
                {
                  step: '02',
                  title: 'Desktop executes',
                  desc: 'Your desktop receives the dispatch, spins up an agent with full tool access (browser, terminal, files, MCP), and begins execution.',
                },
                {
                  step: '03',
                  title: 'Watch in real time',
                  desc: 'The mobile app streams agent progress over Supabase Realtime. See tool calls, intermediate results, and the final output from anywhere.',
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-6 mb-8 last:mb-0">
                  <div className="shrink-0 w-10 h-10 rounded-full border border-[#c8892a]/40 bg-[#c8892a]/[0.08] flex items-center justify-center font-mono text-xs font-bold text-[#c8892a]">
                    {step}
                  </div>
                  <div className="pt-2">
                    <h3 className="font-semibold text-white mb-1">{title}</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8892a] mb-3">
                Features
              </p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Built for the full workflow
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.05] max-w-7xl mx-auto">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-[#09090b] p-7 flex flex-col hover:bg-[#0f0e0c] transition-colors"
                >
                  <Icon className="h-5 w-5 text-[#c8892a] mb-4" />
                  <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed flex-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech facts */}
        <section className="py-20 border-y border-white/[0.05] bg-[#0c0c0e]">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold mb-8">Technical details</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {techFacts.map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/[0.06] bg-[#111114] px-5 py-4 flex items-center justify-between"
                  >
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="font-mono text-sm font-medium text-zinc-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Be first to know.
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              App Store and Play Store listings are not yet live. Join the list and we will reach
              out when the mobile app ships.
            </p>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-[#c8892a] px-8 text-sm font-semibold text-black hover:bg-[#d4993a] transition-all"
            >
              Join the waitlist
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
