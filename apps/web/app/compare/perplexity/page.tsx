import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Perplexity | AGI Workforce',
  description:
    'Honest review of Perplexity. Where Perplexity wins, where AGI Workforce wins, and how the two products differ.',
  alternates: { canonical: 'https://agiworkforce.com/compare/perplexity' },
};

export default function ComparePerplexityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Perplexity.</h1>
          <p className="agi-page-lede">
            Best search-grounded answers. Comet browser is genuinely interesting.{' '}
            <strong>
              Perplexity wins when the question is &ldquo;what does the web say,&rdquo; and we
              don&rsquo;t pretend otherwise.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where Perplexity wins</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Search-grounded answers</h3>
              <p className="agi-reason-p">
                Their answer engine is built around live retrieval, with citations done well. Hard
                to beat for current-events questions.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Comet browser</h3>
              <p className="agi-reason-p">
                Comet is a real product, not a port. The way it integrates the answer engine into
                browsing is genuinely novel.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Sonar models</h3>
              <p className="agi-reason-p">
                Sonar is good at the specific shape of search-grounded answer. Best in class for
                that pattern.
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
                <td>Perplexity ships Sonar plus a few; we run 10+ providers in one thread.</td>
              </tr>
              <tr>
                <td>BYOK against Perplexity</td>
                <td>Bring your Perplexity API key. Same surface as Claude and GPT.</td>
              </tr>
              <tr>
                <td>Local LLM</td>
                <td>No local mode in Perplexity. We ship Ollama and LM Studio.</td>
              </tr>
              <tr>
                <td>Surfaces</td>
                <td>Same chat surface across desktop, mobile, browser, and editor.</td>
              </tr>
              <tr>
                <td>Pricing posture</td>
                <td>Local + BYOK free forever. Pay Perplexity&rsquo;s API rate, no markup.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Honest take</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            For &ldquo;what does the web say right now,&rdquo; use Perplexity. For everything else —
            code, prose, multi-step tool work, cross-provider continuity — that&rsquo;s us. And if
            you do want Sonar inside our app, BYOK against Perplexity works the same as every other
            provider.
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
