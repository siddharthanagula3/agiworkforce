import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

const REVIEWS = [
  {
    name: 'Anthropic Claude',
    href: '/redesign-preview/compare/claude',
    take: 'The class of the field on long-form prose, code review, and tool use. Claude.ai itself is a beautifully restrained product.',
    where_we_lose: 'We don&rsquo;t ship Computer Use polish at Anthropic&rsquo;s Cowork level.',
    where_we_win: 'Their lock-in to Claude only is the entire reason we exist.',
  },
  {
    name: 'OpenAI ChatGPT',
    href: '/redesign-preview/compare/chatgpt',
    take: 'Best tool-use reflex in the field, strongest agent harness, broadest plugin ecosystem on the cloud-app side.',
    where_we_lose: 'No mobile app on Apple Watch. No Atlas browser.',
    where_we_win:
      'BYOK against OpenAI directly with zero markup, plus 11 other providers in the same thread.',
  },
  {
    name: 'Google Gemini',
    href: '/redesign-preview/compare/gemini',
    take: 'Longest production context window. Multimodal-native. Tightly integrated with Workspace.',
    where_we_lose: 'No deep Workspace integration of our own.',
    where_we_win: 'Bring your own Gemini key, route to it from the same surface as Claude and GPT.',
  },
  {
    name: 'Perplexity',
    href: '/redesign-preview/compare/perplexity',
    take: 'Best search-grounded answers. Comet browser is genuinely interesting.',
    where_we_lose: 'No first-party Sonar — we BYOK against Perplexity instead.',
    where_we_win: 'Same chat surface across desktop, mobile, browser, and editor.',
  },
];

export default function RedesignPreviewComparePage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Comparative reviews.</h1>
        <p className="pv-page-lede">
          The other AI tools are not bad. Several are excellent.{' '}
          <strong>The case for AGI Workforce is the routing across all of them</strong> — that lane
          was empty until we shipped. These reviews are honest. Where we lose, we say so.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">The four reviews</p>
        <div className="pv-tier-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {REVIEWS.map((r) => (
            <article key={r.name} className="pv-tier" style={{ gap: 14 }}>
              <h2 className="pv-tier-name">{r.name}</h2>
              <p className="pv-tier-body" dangerouslySetInnerHTML={{ __html: r.take }} />
              <ul className="pv-tier-features" style={{ marginTop: 4 }}>
                <li
                  dangerouslySetInnerHTML={{
                    __html: `<strong style="color:var(--pv-ink)">Where we lose:</strong> ${r.where_we_lose}`,
                  }}
                />
                <li
                  dangerouslySetInnerHTML={{
                    __html: `<strong style="color:var(--pv-ink)">Where we win:</strong> ${r.where_we_win}`,
                  }}
                />
              </ul>
              <Link href={r.href} className="pv-tier-cta pv-tier-cta--ghost">
                Read the review →
              </Link>
            </article>
          ))}
        </div>
        <p className="pv-tier-note">
          <span>The four review pages are next up. The honest summary is on each card here.</span>
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Where AGI Workforce sits</p>
        <table className="pv-ledger">
          <thead>
            <tr>
              <th>&nbsp;</th>
              <th>Claude</th>
              <th>ChatGPT</th>
              <th>Gemini</th>
              <th>Perplexity</th>
              <th>AGI Workforce</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Multi-provider</td>
              <td>Claude only</td>
              <td>OpenAI only</td>
              <td>Google only</td>
              <td>Sonar + a few</td>
              <td>10+ in one thread</td>
            </tr>
            <tr>
              <td>BYOK</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>Every cloud + local</td>
            </tr>
            <tr>
              <td>Local LLM</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>Ollama, LM Studio</td>
            </tr>
            <tr>
              <td>Cross-provider memory</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>Token-level handoff</td>
            </tr>
            <tr>
              <td>Computer use</td>
              <td>Cowork</td>
              <td>Operator</td>
              <td>Limited</td>
              <td>Comet browser</td>
              <td>Per provider, plus our own</td>
            </tr>
            <tr>
              <td>CLI</td>
              <td>Claude Code</td>
              <td>Codex CLI</td>
              <td>Gemini CLI</td>
              <td>—</td>
              <td>Pure Rust, our engine</td>
            </tr>
          </tbody>
        </table>
      </section>

      <AgiFooter />
    </main>
  );
}
