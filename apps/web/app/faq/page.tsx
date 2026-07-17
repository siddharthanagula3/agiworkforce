import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@shared/components/seo/JsonLd';
import { breadcrumbSchema, faqPageSchema } from '@/lib/seo/structured-data';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { MARKETING, POSITIONING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'FAQ',
  description:
    'Frequently asked questions about providers, BYOK, Local mode, AGI managed cloud, and security.',
  path: '/faq',
});

const QA: { q: string; a: string }[] = [
  {
    q: 'How many providers do you support?',
    a: `${MARKETING.providers.display} providers: nine first-party cloud APIs (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu), custom OpenAI-compatible endpoints, and two local runtimes (Ollama and LM Studio).`,
  },
  {
    q: 'What does BYOK mean here?',
    a: 'You bring your own API key on Desktop and CLI. Keys are encrypted at rest on your machine. Traffic goes directly to your provider. Usage is billed by the provider, not by AGI. No markup.',
  },
  {
    q: 'Can I run AGI fully offline?',
    a: 'Yes. Local mode on Desktop and the CLI runs models through Ollama or LM Studio. No API keys, no quotas, no internet. AGI Mobile launches with an on-device Local Mode. Local mode is free.',
  },
  {
    q: 'Can I switch models mid-conversation?',
    a: 'Yes. Pick a different model and the thread continues with the new one. The provider label updates with the switch, so you always know where the next request goes before it leaves your machine.',
  },
  {
    q: 'What does AGI Cloud cost?',
    a: 'AGI managed cloud is in public alpha and open by default — sign in and start, no waitlist. Usage is metered and current plan details live on the pricing page. Local and BYOK remain free. Team & Enterprise (org seats, SSO, admin controls) are the only waitlisted tiers.',
  },
  {
    q: 'Do you train on my data?',
    a: `AGI does not use customer conversation content to train AGI-owned models. ${POSITIONING.trustBoundary}`,
  },
  {
    q: 'What happens to my master password?',
    a: 'The Desktop master password is unrecoverable by design. We never have it. If you forget it, your encrypted keys cannot be decrypted. Back it up.',
  },
  {
    q: 'Is there an Enterprise plan?',
    a: 'Enterprise is in scoping, not on sale. SSO, audit log export, and custom retention are planned; contact sales to discuss your requirements and timeline.',
  },
  {
    q: 'Where do you host data?',
    a: 'Hosted data lives in the United States. EU/UK residency hosting is on the roadmap, not available today. Local conversations never leave your device in the first place.',
  },
];

export default function FaqPage() {
  return (
    <div data-design="agi">
      <JsonLd
        data={[
          faqPageSchema(QA),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'FAQ', path: '/faq' },
          ]),
        ]}
      />
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-faq-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">FAQ</p>
          <h1 id="agi-faq-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Direct answers,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">no spin.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            The questions we get most often, answered the way we'd want them answered. If something
            below is wrong or out of date, email contact@agiworkforce.com and we'll fix it.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
              <li>Local · on-device</li>
              <li>BYOK · your keys</li>
              <li>Cloud · public alpha</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-faq-qa-title">
          <p className="agi-fl-eyebrow">Q &amp; A</p>
          <h2 id="agi-faq-qa-title" className="agi-fl-h2">
            Nine questions, nine straight answers.
          </h2>
          <p className="agi-fl-section-lede">
            Providers, trust modes, managed cloud, and what happens to your data. The short version
            of everything the rest of the site covers at length.
          </p>
          <ul className="agi-reasons" style={{ marginTop: 40 }}>
            {QA.map((item) => (
              <li className="agi-reason" key={item.q}>
                <h3 className="agi-reason-h">{item.q}</h3>
                <p className="agi-reason-p">{item.a}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-faq-more-title">
          <p className="agi-fl-eyebrow">Still stuck?</p>
          <h2 id="agi-faq-more-title" className="agi-fl-h2">
            Ask a human.
          </h2>
          <p className="agi-fl-section-lede">
            The help index covers the common how-tos, and a real person reads the inbox.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/help" className="agi-fl-cta agi-fl-cta--primary">
              Browse the Help Index
            </Link>
            <Link href="/pricing" className="agi-fl-cta agi-fl-cta--secondary">
              See Pricing
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--ghost">
              Email Us
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
