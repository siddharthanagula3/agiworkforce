import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'MCP Directory',
  description:
    'Reference MCP servers you can connect to AGI. A full browsable, searchable directory is coming soon.',
  path: '/connectors/mcp-directory',
});

const FEATURED_MCPS = [
  {
    name: 'Filesystem',
    description: 'Read and write files on your local machine.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'local'],
  },
  {
    name: 'GitHub',
    description: 'Repos, issues, PRs, and code search via GitHub API.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'developer'],
  },
  {
    name: 'Postgres',
    description: 'Query and manage PostgreSQL databases.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'database'],
  },
  {
    name: 'Brave Search',
    description: 'Web and local search powered by Brave.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'search'],
  },
  {
    name: 'Slack',
    description: 'Post messages and read channels via Slack API.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'productivity'],
  },
  {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping via Puppeteer.',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['official', 'automation'],
  },
];

export default function McpDirectoryPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <Link href="/connectors" className="agi-cta-ghost" style={{ paddingTop: 0 }}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Connectors
          </Link>
          <h1 className="agi-page-h1" style={{ marginTop: 18 }}>
            MCP Directory.
          </h1>
          <p className="agi-page-lede">
            A full browsable, searchable directory is coming soon. Until then, here are a few
            well-known reference servers &mdash; all maintained in the official Model Context
            Protocol servers repository. Copy a server&rsquo;s setup into the custom connector
            dialog when you are ready to connect it.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Reference servers &middot; official repo</p>
          <div className="agi-route-grid">
            {FEATURED_MCPS.map((mcp) => (
              <a
                key={mcp.name}
                href={mcp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="agi-route-card"
              >
                <span className="agi-route-meta">{mcp.tags.join(' / ')}</span>
                <span className="agi-route-title">{mcp.name}</span>
                <span className="agi-route-body">{mcp.description}</span>
                <span
                  className="agi-cta-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18 }}
                >
                  View reference repo
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="agi-section">
          <div className="agi-launch-cta">
            <div>
              <h2 className="agi-launch-title">Bring your own tools.</h2>
              <p className="agi-launch-body">
                The official MCP registry lists hundreds of community-contributed servers. AGI
                should expose each server only inside the mode and permission boundary the user
                selected.
              </p>
            </div>
            <a
              href="https://modelcontextprotocol.io/registry/about"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-primary"
            >
              Open MCP Registry
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
