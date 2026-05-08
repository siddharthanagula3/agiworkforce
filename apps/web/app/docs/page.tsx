import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Documentation | AGI Workforce',
  description:
    'Reference material for every surface — desktop, mobile, CLI, web, Chrome extension, VS Code extension.',
  alternates: { canonical: 'https://agiworkforce.com/docs' },
};

const SECTIONS: { title: string; items: { href: string; label: string; body: string }[] }[] = [
  {
    title: 'Get going',
    items: [
      {
        href: '/get-started',
        label: 'Get started',
        body: 'Five minutes from zero to a working chat.',
      },
      {
        href: '/download',
        label: 'Install',
        body: 'Homebrew, cargo, curl, and platform binaries.',
      },
      {
        href: '/byok',
        label: 'Bring your own keys',
        body: 'Add a provider key and chat directly against it.',
      },
      { href: '/local', label: 'Run offline', body: 'Ollama or LM Studio. No keys, no quotas.' },
    ],
  },
  {
    title: 'Surfaces',
    items: [
      {
        href: '/desktop',
        label: 'Desktop',
        body: 'Tauri + Rust. Local or Cloud mode. Computer use.',
      },
      { href: '/mobile', label: 'Mobile', body: 'Phone as commander. Desktop as agent.' },
      { href: '/cli', label: 'CLI', body: 'Pure Rust. Headless, replayable, sandboxed.' },
      {
        href: '/chrome-extension',
        label: 'Chrome extension',
        body: 'Side panel + bridge. Extension is UI; desktop is brain.',
      },
      {
        href: '/vscode-extension',
        label: 'VS Code extension',
        body: '@agi participant + inline completions + slash commands.',
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      { href: '/api-docs', label: 'API reference', body: 'OpenAI-compatible gateway endpoints.' },
      {
        href: '/providers',
        label: 'Providers',
        body: 'The 12-cell roster and what each is best at.',
      },
      {
        href: '/integrations',
        label: 'Integrations',
        body: 'MCP plugins, native messaging, BYOK.',
      },
      { href: '/faq', label: 'FAQ', body: 'Frequently asked questions.' },
    ],
  },
  {
    title: 'Trust',
    items: [
      { href: '/security', label: 'Security', body: 'Keys, tools, data — operational posture.' },
      { href: '/privacy', label: 'Privacy', body: 'What we collect, how we use it.' },
      { href: '/trust', label: 'Trust', body: 'Compliance dates, honestly.' },
      { href: '/changelog', label: 'Changelog', body: 'A dated archive of what shipped.' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Documentation.</h1>
          <p className="agi-page-lede">
            Reference material for every surface AGI Workforce ships.{' '}
            <strong>
              Detailed protocol, API, and CLI reference lives on GitHub. The pages below cover the
              concepts most users need.
            </strong>
          </p>
          <div className="agi-cta-row">
            <a
              href="https://github.com/siddharthanagula3/agiworkforce"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-primary"
            >
              GitHub repo
            </a>
            <a
              href="https://github.com/siddharthanagula3/agiworkforce/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-ghost"
            >
              Detailed docs →
            </a>
          </div>
        </section>
        {SECTIONS.map((section) => (
          <section className="agi-section" key={section.title}>
            <p className="agi-section-eyebrow">{section.title}</p>
            <table className="agi-ledger">
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.href}>
                    <td style={{ width: '28%' }}>
                      <Link href={item.href} style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                        {item.label}
                      </Link>
                    </td>
                    <td>{item.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <MarketingFooter />
      </main>
    </div>
  );
}
