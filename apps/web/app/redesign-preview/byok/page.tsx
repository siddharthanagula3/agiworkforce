import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

export default function RedesignPreviewByokPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Your keys. Your data. Your cost.</h1>
        <p className="pv-page-lede">
          Pay providers directly. We add zero markup, store nothing in the middle, and never see
          your prompts or responses. Keys are encrypted on your device with{' '}
          <strong>AES-256-GCM</strong> using a master password we don&rsquo;t hold.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">How it works</p>
        <ol className="pv-steps">
          <li className="pv-step">
            <span className="pv-step-n">01 / Paste your key</span>
            <h3 className="pv-step-h">Paste your key</h3>
            <p className="pv-step-body">
              Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu — all
              supported. Or any OpenAI-compatible BYO endpoint.
            </p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">02 / Encrypted on device</span>
            <h3 className="pv-step-h">Encrypted on device</h3>
            <p className="pv-step-body">
              The key is encrypted immediately on your device with AES-256-GCM using your master
              password. Never stored on our servers in plaintext, never transmitted in the clear.
            </p>
          </li>
          <li className="pv-step">
            <span className="pv-step-n">03 / Pay providers directly</span>
            <h3 className="pv-step-h">Pay providers directly</h3>
            <p className="pv-step-body">
              Your usage is billed by the provider, not us. Zero markup. Whatever Anthropic and
              OpenAI charge you, that&rsquo;s what you pay.
            </p>
          </li>
        </ol>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Security stance</p>
        <div className="pv-callout">
          <h2 className="pv-callout-h">
            Master password <span className="pv-callout-amber">cannot</span> be recovered.
          </h2>
          <p className="pv-callout-p">
            We don&rsquo;t know it. We don&rsquo;t hold it. If you forget it, your encrypted keys
            are unrecoverable. Back it up.
          </p>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Where things actually live</p>
        <table className="pv-ledger">
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

      <AgiFooter />
    </main>
  );
}
