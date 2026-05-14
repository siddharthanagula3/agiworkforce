import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Anthropic Claude | AGI Workforce',
  description:
    'Honest review of Anthropic Claude. Where Claude wins, where AGI Workforce wins, and how the two products differ.',
  alternates: { canonical: 'https://agiworkforce.com/compare/claude' },
};

export default function CompareClaudePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Anthropic Claude.</h1>
          <p className="agi-page-lede">
            The class of the field on long-form prose, code review, and tool use. Claude.ai itself
            is a beautifully restrained product.{' '}
            <strong>
              The reason AGI Workforce exists is that Anthropic locks you to Claude — and we
              don&rsquo;t.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where Claude wins</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Long-form quality</h3>
              <p className="agi-reason-p">
                On essays, code review, and structured analysis, Claude is consistently the model we
                reach for inside our own thread.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Computer Use polish</h3>
              <p className="agi-reason-p">
                Cowork ships further than our own desktop computer use. Anthropic put serious work
                into the safety and the screenshot loop.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">A coherent product</h3>
              <p className="agi-reason-p">
                Claude.ai, Claude Code, the Chrome extension — these feel designed by one team. We
                respect that.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where AGI Workforce wins</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Provider lock-in</td>
                <td>Anthropic locks you to Claude. We route to 10+ providers in one thread.</td>
              </tr>
              <tr>
                <td>BYOK</td>
                <td>
                  Anthropic does not accept user keys. We accept keys for every cloud provider.
                </td>
              </tr>
              <tr>
                <td>Local LLM</td>
                <td>Claude has no local mode. We ship Ollama and LM Studio support.</td>
              </tr>
              <tr>
                <td>Cross-provider memory</td>
                <td>Token-level handoff between Claude, GPT, Gemini in the same thread.</td>
              </tr>
              <tr>
                <td>Pricing posture</td>
                <td>Local + BYOK free forever. Hobby $10/mo or $5/mo annual.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Honest take</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            If you only ever want Claude, claude.ai is the better product. If you want Claude{' '}
            <em>and</em> GPT and Gemini and a local model in the same chat history, that&rsquo;s us.
            Claude is excellent. So is GPT-5. So is Gemini on long context. We are the only place to
            run all of them in one thread.
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
