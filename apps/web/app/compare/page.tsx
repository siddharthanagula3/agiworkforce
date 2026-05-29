import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Comparative reviews - Claude, ChatGPT, Gemini, Perplexity, Codex, Claude Code vs AGI',
  description:
    'Honest reviews of the major AI tools and where AGI sits. The case for us is the routing across all of them.',
  alternates: { canonical: 'https://agiworkforce.com/compare' },
};

const REVIEWS = [
  {
    name: 'Anthropic Claude',
    href: '/compare/claude',
    take: 'The class of the field on long-form prose, code review, and tool use. Claude.ai itself is a beautifully restrained product.',
    where_we_lose: 'We don’t ship Computer Use polish at Anthropic’s Cowork level.',
    where_we_win: 'Their lock-in to Claude only is the entire reason we exist.',
  },
  {
    name: 'OpenAI ChatGPT',
    href: '/compare/chatgpt',
    take: 'Best tool-use reflex in the field, strongest agent harness, broadest plugin ecosystem on the cloud-app side.',
    where_we_lose: 'No Apple Watch app. No Atlas browser of our own.',
    where_we_win:
      'BYOK against OpenAI and other supported providers in the same thread, with route-specific provider billing.',
  },
  {
    name: 'OpenAI Codex',
    href: '/compare/codex',
    take: 'A serious coding agent across CLI, app, IDE, and cloud workflows. It sets the benchmark for developer-agent UX.',
    where_we_lose:
      'We still need to prove the same cloud-task polish, PR flow, and OpenAI-level coding-model integration.',
    where_we_win:
      'AGI Code is designed around local models, BYOK providers, and provider switching instead of a single model ecosystem.',
  },
  {
    name: 'Anthropic Claude Code',
    href: '/compare/claude-code',
    take: 'The terminal-native coding workflow is excellent: repo context, permissions, MCP, hooks, and iterative command loops.',
    where_we_lose: 'Claude Code is more mature today for Anthropic-model coding workflows.',
    where_we_win:
      'AGI targets the same developer control pattern across Local, BYOK, and invite-only Cloud modes.',
  },
  {
    name: 'Google Gemini',
    href: '/compare/gemini',
    take: 'Longest production context window. Multimodal-native. Tightly integrated with Workspace.',
    where_we_lose: 'No deep Workspace integration of our own.',
    where_we_win: 'Bring your own Gemini key, route to it from the same surface as Claude and GPT.',
  },
  {
    name: 'Perplexity',
    href: '/compare/perplexity',
    take: 'Best search-grounded answers. Comet browser is genuinely interesting.',
    where_we_lose: 'No first-party Sonar — we BYOK against Perplexity instead.',
    where_we_win: 'Same chat surface across desktop, mobile, browser, and editor.',
  },
];

export default function ComparePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Comparative reviews.</h1>
          <p className="agi-page-lede">
            The other AI tools are not bad. Several are excellent.{' '}
            <strong>The case for AGI is explicit routing across supported providers</strong>. These
            reviews are honest. Where we lose, we say so. {POSITIONING.trustBoundary}
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The four reviews</p>
          <div className="agi-tier-grid">
            {REVIEWS.map((r) => (
              <article key={r.name} className="agi-tier" style={{ gap: 14 }}>
                <h2 className="agi-tier-name">{r.name}</h2>
                <p className="agi-tier-body">{r.take}</p>
                <ul className="agi-tier-features" style={{ marginTop: 4 }}>
                  <li>
                    <strong style={{ color: 'var(--agi-ink)' }}>Where we lose:</strong>{' '}
                    {r.where_we_lose}
                  </li>
                  <li>
                    <strong style={{ color: 'var(--agi-ink)' }}>Where we win:</strong>{' '}
                    {r.where_we_win}
                  </li>
                </ul>
                <Link href={r.href} className="agi-tier-cta agi-tier-cta--ghost">
                  Read the review →
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where AGI sits</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>&nbsp;</th>
                <th>Claude</th>
                <th>ChatGPT</th>
                <th>Gemini</th>
                <th>Perplexity</th>
                <th>AGI</th>
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
        <MarketingFooter />
      </main>
    </div>
  );
}
