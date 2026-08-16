import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'MCP Reference Servers',
  description:
    'A short hand-picked list of stdio MCP servers Desktop can install. This is not a browsable registry — use the official MCP registry for that.',
  path: '/connectors/mcp-directory',
});

const REFERENCE_MCPS = [
  {
    name: 'Filesystem',
    description: 'Read and write files on your local machine.',
    pkg: '@modelcontextprotocol/server-filesystem',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'local'],
  },
  {
    name: 'Git',
    description: 'Repository status, diffs, branches, and commits.',
    pkg: 'mcp-server-git',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'developer'],
  },
  {
    name: 'GitHub',
    description: 'Repos, issues, and pull requests via the GitHub API.',
    pkg: '@modelcontextprotocol/server-github',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'developer'],
  },
  {
    name: 'Postgres',
    description: 'Query and manage PostgreSQL databases.',
    pkg: '@modelcontextprotocol/server-postgres',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'database'],
  },
  {
    name: 'Slack',
    description: 'Post messages and read channels via the Slack API.',
    pkg: '@modelcontextprotocol/server-slack',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'productivity'],
  },
  {
    name: 'Memory',
    description: 'Persistent knowledge-graph storage for long-term context.',
    pkg: '@modelcontextprotocol/server-memory',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: ['stdio', 'data'],
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
            MCP reference servers.
          </h1>
          <p className="agi-page-lede">
            This is a short hand-picked list, not a registry &mdash; we do not host a browsable or
            searchable MCP directory, and there is no plan date for one. Every server below is a
            stdio process, so it runs on Desktop or the CLI, not in the browser. Desktop&rsquo;s
            built-in server browser installs each of these by name. To search the full catalogue of
            community servers, use the official MCP registry.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Installable from Desktop &middot; stdio</p>
          <div className="agi-route-grid">
            {REFERENCE_MCPS.map((mcp) => (
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
                <code className="agi-route-body" style={{ marginTop: 10, fontSize: '0.78em' }}>
                  {mcp.pkg}
                </code>
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
                The official MCP registry lists hundreds of community-contributed servers. We do not
                mirror, curate, or sign any of them. On the web, the custom connector dialog accepts
                a remote HTTP or SSE MCP endpoint and your own token; stdio servers like the ones
                above have no URL, so add those from Desktop or the CLI instead.
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
