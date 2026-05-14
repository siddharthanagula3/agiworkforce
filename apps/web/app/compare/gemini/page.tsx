import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'AGI Workforce vs Google Gemini | AGI Workforce',
  description:
    'Honest review of Google Gemini. Where Gemini wins, where AGI Workforce wins, and how the two products differ.',
  alternates: { canonical: 'https://agiworkforce.com/compare/gemini' },
};

export default function CompareGeminiPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Google Gemini.</h1>
          <p className="agi-page-lede">
            Longest production context window. Multimodal-native. Tightly integrated with Workspace.{' '}
            <strong>
              Gemini is the right model when the context is enormous or the data lives in your
              Google account. We bring you a Gemini key in the same place you bring Claude.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where Gemini wins</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Context window</h3>
              <p className="agi-reason-p">
                The largest production context window in the field. If you have a million tokens of
                source code or transcript to reason over, Gemini is the right call.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Multimodal-native</h3>
              <p className="agi-reason-p">
                Native video, audio, and image understanding without the round-trip to a separate
                vision model.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Workspace integration</h3>
              <p className="agi-reason-p">
                Drive, Docs, Sheets, Calendar — Gemini reads them natively because it&rsquo;s a
                Google product.
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
                <td>Gemini chat is Google only. We run 10+ providers in one thread.</td>
              </tr>
              <tr>
                <td>BYOK against Google</td>
                <td>Bring your Gemini API key. Pay Google directly. Zero markup.</td>
              </tr>
              <tr>
                <td>Local LLM</td>
                <td>No local Gemini. Ollama and LM Studio for offline work.</td>
              </tr>
              <tr>
                <td>Cross-provider memory</td>
                <td>Use Gemini for long context, hand off to Claude or GPT for the next turn.</td>
              </tr>
              <tr>
                <td>Pricing posture</td>
                <td>Local + BYOK free forever. Pay Google&rsquo;s API price, not a markup.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Honest take</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            For Workspace-heavy teams, Gemini in the Workspace UI is hard to beat. We don&rsquo;t
            have that tight Google integration. What we do have: Gemini key support next to every
            other provider, in one chat. If you want to compare Claude&rsquo;s answer to
            Gemini&rsquo;s answer on the same prompt, that takes one model switch in our app.
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
