import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'FAQ | AGI Workforce',
  description: 'Frequently asked questions — providers, BYOK, local mode, pricing, security.',
  alternates: { canonical: 'https://agiworkforce.com/faq' },
};

const QA: { q: string; a: string }[] = [
  {
    q: 'How many providers do you support?',
    a: 'Ten cloud providers wired in (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, plus Custom OpenAI-compatible BYO). Two local options (Ollama, LM Studio).',
  },
  {
    q: 'What does BYOK mean here?',
    a: 'You bring your own API key. We encrypt it on your device with AES-256-GCM. Your usage is billed by the provider, not us. Zero markup.',
  },
  {
    q: 'Can I run AGI Workforce fully offline?',
    a: 'Yes. Local mode on the desktop app uses Ollama or LM Studio. No API keys, no quotas, no internet. Free forever.',
  },
  {
    q: 'How does cross-provider continuity work?',
    a: 'When you switch model mid-conversation, the full history (system prompt, tool calls, intermediate reasoning) travels as token-level events — not summaries. Same chat surface, different brain.',
  },
  {
    q: 'What does Hobby cost?',
    a: '$10/mo, or $5/mo if you pay annually. The only paid tier shipping today. Pro / Pro+ / Max are on the waitlist until our security audit closes.',
  },
  {
    q: 'Do you train on my data?',
    a: 'No. We do not train on customer data. Local mode never sends your prompts off your machine.',
  },
  {
    q: 'What happens to my master password?',
    a: 'It is unrecoverable by design — we do not have it. If you forget it, your encrypted keys cannot be decrypted. Back it up.',
  },
  {
    q: 'Is there an Enterprise plan?',
    a: 'Yes. SSO, SCIM, audit log export, custom retention, regional residency on request, four-hour SLA. Contact sales.',
  },
  {
    q: 'Where do you host data?',
    a: 'us-east-2 by default (Supabase). EU on the roadmap. Custom regions on Enterprise contracts.',
  },
];

export default function FaqPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">FAQ.</h1>
          <p className="agi-page-lede">
            Direct answers to the questions we get most often.{' '}
            <strong>
              If something below is wrong or out of date, email contact@agiworkforce.com.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Q &amp; A</p>
          <table className="agi-ledger">
            <tbody>
              {QA.map((item) => (
                <tr key={item.q}>
                  <td
                    style={{
                      width: '32%',
                      verticalAlign: 'top',
                      color: 'var(--agi-ink)',
                      fontWeight: 600,
                    }}
                  >
                    {item.q}
                  </td>
                  <td>{item.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Still stuck?</p>
          <div className="agi-cta-row">
            <Link href="/help" className="agi-cta-primary">
              Help index
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-ghost">
              Email us →
            </a>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
