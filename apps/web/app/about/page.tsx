import Link from 'next/link';
import { Bot, Target, Zap, Shield, Users, ArrowRight } from 'lucide-react';
import { Header } from '../../components/layout/Header';
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
        url: '/og-image.svg',
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
    images: ['/og-image.svg'],
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
      logo: 'https://agiworkforce.com/logo.svg',
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
        email: 'contact@agiagentautomation.com',
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
      <div className="flex min-h-screen flex-col bg-black text-white">
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
              <div className="max-w-md mx-auto">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 mx-auto mb-6 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">SN</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-1">Siddhartha Nagula</h3>
                  <p className="text-blue-400 mb-4">Founder & CEO</p>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Passionate about building tools that empower people to do more with less.
                    Leading the vision to make AI automation accessible to everyone.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Company Info */}
          <section className="py-24 bg-zinc-950">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">2025</div>
                  <div className="text-zinc-400">Founded</div>
                </div>
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">Austin, TX</div>
                  <div className="text-zinc-400">Headquarters</div>
                </div>
                <div className="p-8">
                  <div className="text-4xl font-bold text-blue-500 mb-2">Global</div>
                  <div className="text-zinc-400">Customer Reach</div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-24 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-600/10" />
            <div className="container relative mx-auto px-4 text-center">
              <h2 className="text-4xl font-bold tracking-tight mb-6">Ready to Get Started?</h2>
              <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
                Just tell the AI what you want done. No setup, no configuration - everything is
                reversible.
              </p>
              <Link
                href="/download"
                className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-lg font-bold text-black transition-transform hover:scale-105"
              >
                Download for Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-black py-12">
          <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 font-bold">
              <Bot className="h-5 w-5 text-zinc-500" />
              <span className="text-zinc-500">AGI Workforce</span>
            </div>
            <div className="text-sm text-zinc-600">
              &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
