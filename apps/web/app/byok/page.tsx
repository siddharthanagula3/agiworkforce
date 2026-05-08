import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'BYOK — Your keys, your data, your cost | AGI Workforce',
  description:
    'Bring your own keys to any cloud provider. Pay providers directly. Zero markup. AES-256-GCM encrypted on device with a master password we do not hold.',
  alternates: { canonical: 'https://agiworkforce.com/byok' },
};

export default function ByokPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Your keys. Your data. Your cost.</h1>
          <p className="agi-page-lede">
            Pay providers directly. We add zero markup, store nothing in the middle, and never see
            your prompts or responses. Keys are encrypted on your device with{' '}
            <strong>AES-256-GCM</strong> using a master password we don&rsquo;t hold.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How it works</p>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Paste your key</span>
              <h3 className="agi-step-h">Paste your key</h3>
              <p className="agi-step-body">
                Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu — all
                supported. Or any OpenAI-compatible BYO endpoint.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / Encrypted on device</span>
              <h3 className="agi-step-h">Encrypted on device</h3>
              <p className="agi-step-body">
                The key is encrypted immediately on your device with AES-256-GCM using your master
                password. Never stored on our servers in plaintext.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Pay providers directly</span>
              <h3 className="agi-step-h">Pay providers directly</h3>
              <p className="agi-step-body">
                Your usage is billed by the provider, not us. Zero markup. Whatever Anthropic and
                OpenAI charge you, that&rsquo;s what you pay.
              </p>
            </li>
          </ol>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Security stance</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">
              Master password <span className="agi-callout-amber">cannot</span> be recovered.
            </h2>
            <p className="agi-callout-p">
              We don&rsquo;t know it. We don&rsquo;t hold it. If you forget it, your encrypted keys
              are unrecoverable. Back it up.
            </p>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where things actually live</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>&nbsp;</th>
                <th>Local mode</th>
                <th>BYOK Cloud</th>
                <th>Hobby Managed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Conversations</td>
                <td>SQLite, on disk</td>
                <td>Supabase us-east-2</td>
                <td>Supabase us-east-2</td>
              </tr>
              <tr>
                <td>API keys</td>
                <td>Encrypted on disk</td>
                <td>Encrypted on disk</td>
                <td>Managed by us</td>
              </tr>
              <tr>
                <td>Model calls</td>
                <td>Localhost only</td>
                <td>Direct to provider</td>
                <td>Through our proxy</td>
              </tr>
              <tr>
                <td>Files</td>
                <td>Never leave laptop</td>
                <td>Provider only on send</td>
                <td>Provider only on send</td>
              </tr>
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
