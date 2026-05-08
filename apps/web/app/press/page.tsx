import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Press | AGI Workforce',
  description:
    'Press materials and contact for AGI Workforce — what we are, who runs it, and how to reach us.',
  alternates: { canonical: 'https://agiworkforce.com/press' },
};

export default function PressPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Press.</h1>
          <p className="agi-page-lede">
            What AGI Workforce is and who runs it, in language a journalist or analyst can paste
            verbatim.{' '}
            <strong>
              For interviews, demos, or quotes, email{' '}
              <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
                contact@agiworkforce.com
              </a>{' '}
              with your outlet, deadline, and the angle.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The one-paragraph version</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Workforce is a multi-provider AI agent platform. The same chat surface runs across
            desktop, web, mobile, CLI, Chrome extension, and VS Code — wired into 10+ AI providers
            (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, plus local
            via Ollama and LM Studio). Users bring their own API keys, switch models
            mid-conversation, and keep token-level history across providers. AGI Workforce is built
            by AGI Automation LLC, an Austin-based independent shop.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Quick facts</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Company</td>
                <td>AGI Automation LLC, Austin, Texas</td>
              </tr>
              <tr>
                <td>Founded</td>
                <td>2026</td>
              </tr>
              <tr>
                <td>Product surfaces</td>
                <td>Desktop · Web · Mobile · CLI · Chrome ext · VS Code ext</td>
              </tr>
              <tr>
                <td>Providers wired</td>
                <td>10+ cloud · 2 local · custom OpenAI-compatible BYO</td>
              </tr>
              <tr>
                <td>Differentiators</td>
                <td>Multi-provider routing · BYOK + local · cross-provider session continuity</td>
              </tr>
              <tr>
                <td>Pricing posture</td>
                <td>Local + BYOK free forever. Hobby paid. Pro / Pro+ / Max waitlist.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Contact</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email press
            </a>
            <Link href="/about" className="agi-cta-ghost">
              About →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
