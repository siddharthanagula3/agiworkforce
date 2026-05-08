import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AGI Workforce vs OpenAI ChatGPT | AGI Workforce',
  description:
    'Honest review of OpenAI ChatGPT. Where ChatGPT wins, where AGI Workforce wins, and how the two products differ.',
  alternates: { canonical: 'https://agiworkforce.com/compare/chatgpt' },
};

export default function CompareChatGPTPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">OpenAI ChatGPT.</h1>
          <p className="agi-page-lede">
            Best tool-use reflex in the field, strongest agent harness, broadest plugin ecosystem on
            the cloud-app side.{' '}
            <strong>
              ChatGPT is excellent at being ChatGPT. We let you BYOK against OpenAI plus 11 other
              providers — without leaving one chat surface.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where ChatGPT wins</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Tool use</h3>
              <p className="agi-reason-p">
                The tool-call reflex on GPT is sharp. It picks the right tool, calls it, and handles
                failure with grace.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Agent harness</h3>
              <p className="agi-reason-p">
                Operator, Atlas browser, the Apple Watch app — OpenAI is willing to ship surfaces we
                don&rsquo;t have yet.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Plugin ecosystem</h3>
              <p className="agi-reason-p">
                On the cloud-app side, the GPT plugin gallery is genuinely broad and useful.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where AGI Workforce wins</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Multi-provider</td>
                <td>ChatGPT runs OpenAI only. We run 10+ providers in one thread.</td>
              </tr>
              <tr>
                <td>BYOK against OpenAI</td>
                <td>Pay OpenAI directly. We add zero markup. ChatGPT charges you their margin.</td>
              </tr>
              <tr>
                <td>Local LLM</td>
                <td>ChatGPT has no local mode. We ship Ollama and LM Studio.</td>
              </tr>
              <tr>
                <td>Cross-provider memory</td>
                <td>Switch from GPT to Claude mid-thread without losing the conversation.</td>
              </tr>
              <tr>
                <td>Pricing posture</td>
                <td>Local + BYOK free forever. ChatGPT Plus is $20/mo with no BYOK option.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Honest take</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            ChatGPT is the most polished single-provider AI app on the market. If you&rsquo;re
            committed to OpenAI and you want their product story end-to-end, use ChatGPT. If you
            want OpenAI <em>plus</em> Claude plus Gemini plus your local model in the same chat,
            that&rsquo;s us.
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Try AGI Workforce
            </Link>
            <Link href="/compare" className="agi-cta-ghost">
              Read the other reviews →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
