import { Bot, Target, Zap, Shield, Users } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { CtaSection } from '../../components/marketing/CtaSection';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us - AGI Automation LLC | AGI Workforce',
  description:
    'Meet the team behind AGI Workforce. Founded in 2025 in Austin, TX, AGI Automation LLC is on a mission to democratize AI automation and help people work smarter.',
  keywords: [
    'AGI Automation LLC',
    'AGI Workforce',
    'AI automation company',
    'Siddhartha Nagula',
    'Austin TX startup',
    'AI agents',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/about',
  },
  openGraph: {
    title: 'About AGI Automation LLC | AGI Workforce',
    description:
      "Meet the team behind AGI Workforce. Founded in 2025 in Austin, TX, we're democratizing AI automation.",
    url: 'https://agiworkforce.com/about',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - About Us',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About AGI Automation LLC | AGI Workforce',
    description: 'Meet the team behind AGI Workforce. Founded in 2025 in Austin, TX.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://agiworkforce.com/#organization',
      name: 'AGI Automation LLC',
      url: 'https://agiworkforce.com',
      logo: 'https://agiworkforce.com/logo.png',
      description:
        'AGI Automation LLC builds AGI Workforce, a desktop app where you tell the AI what you want and it handles everything - with full undo support.',
      foundingDate: '2025',
      foundingLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Austin',
          addressRegion: 'TX',
          addressCountry: 'US',
        },
      },
      founder: {
        '@type': 'Person',
        '@id': 'https://agiworkforce.com/#founder',
        name: 'Siddhartha Nagula',
        jobTitle: 'Founder & CEO',
        worksFor: {
          '@id': 'https://agiworkforce.com/#organization',
        },
      },
      sameAs: [
        'https://www.linkedin.com/company/agi-automation-llc',
        'https://www.instagram.com/agiworkforce',
        'https://twitter.com/agiworkforce',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contact@agiworkforce.com',
      },
    },
    {
      '@type': 'Person',
      '@id': 'https://agiworkforce.com/#founder',
      name: 'Siddhartha Nagula',
      jobTitle: 'Founder & CEO',
      description:
        'Founder and CEO of AGI Automation LLC, passionate about building tools that empower people to work smarter with AI.',
      worksFor: {
        '@type': 'Organization',
        name: 'AGI Automation LLC',
      },
    },
    {
      '@type': 'WebPage',
      '@id': 'https://agiworkforce.com/about',
      url: 'https://agiworkforce.com/about',
      name: 'About Us - AGI Automation LLC',
      description: 'Learn about AGI Automation LLC, the company behind AGI Workforce.',
      isPartOf: {
        '@id': 'https://agiworkforce.com/#website',
      },
      about: {
        '@id': 'https://agiworkforce.com/#organization',
      },
    },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 md:py-32">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                Building the Future of
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
                  {' '}
                  AI Automation
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                We believe everyone deserves access to powerful AI tools. AGI Workforce makes
                automation accessible, secure, and incredibly powerful.
              </p>
            </div>
          </section>

          {/* Mission Section */}
          <section className="py-24 bg-zinc-950">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-2 gap-16 items-center">
                <div>
                  <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400 mb-6">
                    <Target className="h-4 w-4 mr-2" />
                    Our Mission
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight mb-6">
                    Helping People Work Smarter, Not Harder
                  </h2>
                  <p className="text-zinc-400 text-lg leading-relaxed mb-6">
                    At AGI Automation LLC, we&apos;re on a mission to democratize AI automation. We
                    believe that powerful AI tools shouldn&apos;t be locked behind enterprise
                    contracts or require a team of engineers to deploy.
                  </p>
                  <p className="text-zinc-400 text-lg leading-relaxed">
                    With AGI Workforce, you simply tell the AI what you want done - no technical
                    knowledge required. Everything is reversible, so you can experiment freely
                    knowing you can always undo.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { icon: Zap, label: 'Fast', desc: 'Native performance' },
                    { icon: Shield, label: 'Secure', desc: 'Local-first privacy' },
                    { icon: Bot, label: 'Smart', desc: 'Multi-LLM support' },
                    { icon: Users, label: 'Simple', desc: 'No code required' },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-zinc-800 bg-black/50 p-6 text-center"
                    >
                      <item.icon className="h-8 w-8 text-blue-500 mx-auto mb-3" />
                      <div className="font-semibold mb-1">{item.label}</div>
                      <div className="text-sm text-zinc-500">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Founder Section */}
          <section className="py-24 bg-black">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tight mb-4">Leadership</h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">
                  AGI Workforce is built by a passionate team dedicated to making AI accessible to
                  everyone.
                </p>
              </div>
              <div className="max-w-xl mx-auto">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 mx-auto mb-6 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">SN</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-1">Siddhartha Nagula</h3>
                  <p className="text-blue-400 mb-4">Founder & CEO</p>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                    Software engineer and AI researcher focused on making autonomous AI tools safe
                    and accessible. Built AGI Workforce from the ground up as a native Tauri desktop
                    app with a privacy-first architecture.
                  </p>
                  <div className="flex justify-center gap-4">
                    <a
                      href="https://www.linkedin.com/company/agi-automation-llc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-white transition-colors border border-zinc-700 rounded-full px-3 py-1"
                    >
                      LinkedIn
                    </a>
                    <a
                      href="https://twitter.com/agiworkforce"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-white transition-colors border border-zinc-700 rounded-full px-3 py-1"
                    >
                      Twitter / X
                    </a>
                  </div>
                </div>

                {/* Why we built this */}
                <div className="mt-8 rounded-2xl border border-zinc-800 border-l-[#c8892a] border-l-2 bg-zinc-900/50 p-8">
                  <h4 className="text-lg font-semibold mb-3 text-white">Why we built this</h4>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Every powerful AI tool we tried was either locked to one model, cloud-only, or
                    required engineering expertise to set up. We built AGI Workforce to fix that — a
                    native desktop app where you bring your own API keys, run models locally, and
                    stay in full control of your data. No subscriptions to 5 different tools. One
                    app, any model, full autonomy.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Company Info */}
          <section className="py-24 bg-zinc-950">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-4 gap-8 text-center">
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">25+</div>
                  <div className="text-zinc-300 font-medium">AI Providers</div>
                  <div className="text-sm text-zinc-500 mt-1">OpenAI, Anthropic, Google & more</div>
                </div>
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">Dozens</div>
                  <div className="text-zinc-300 font-medium">AI Skills</div>
                  <div className="text-sm text-zinc-500 mt-1">Across multiple categories</div>
                </div>
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">macOS</div>
                  <div className="text-zinc-300 font-medium">Windows &amp; Linux</div>
                  <div className="text-sm text-zinc-500 mt-1">Native desktop app</div>
                </div>
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">BYOK</div>
                  <div className="text-zinc-300 font-medium">Own Your Keys</div>
                  <div className="text-sm text-zinc-500 mt-1">No middleman, no markup</div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <CtaSection
            headline="Ready to Get Started?"
            body="Just tell the AI what you want done. No setup, no configuration — everything is reversible."
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
