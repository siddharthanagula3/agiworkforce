import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'MCP Directory | AGI Workforce',
  description:
    'Browse community-built MCP servers for databases, APIs, developer tools, and more. Connect any MCP-compatible server to AGI Workforce.',
  alternates: { canonical: '/connectors/mcp-directory' },
};

const FEATURED_MCPS = [
  {
    name: 'Filesystem',
    description: 'Read and write files on your local machine.',
    url: 'https://modelcontextprotocol.io/docs/servers/filesystem',
    tags: ['official', 'local'],
  },
  {
    name: 'GitHub',
    description: 'Repos, issues, PRs, and code search via GitHub API.',
    url: 'https://modelcontextprotocol.io/docs/servers/github',
    tags: ['official', 'developer'],
  },
  {
    name: 'Postgres',
    description: 'Query and manage PostgreSQL databases.',
    url: 'https://modelcontextprotocol.io/docs/servers/postgres',
    tags: ['official', 'database'],
  },
  {
    name: 'Brave Search',
    description: 'Web and local search powered by Brave.',
    url: 'https://modelcontextprotocol.io/docs/servers/brave-search',
    tags: ['official', 'search'],
  },
  {
    name: 'Slack',
    description: 'Post messages and read channels via Slack API.',
    url: 'https://modelcontextprotocol.io/docs/servers/slack',
    tags: ['official', 'productivity'],
  },
  {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping via Puppeteer.',
    url: 'https://modelcontextprotocol.io/docs/servers/puppeteer',
    tags: ['official', 'automation'],
  },
];

export default function McpDirectoryPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#edebe8]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/connectors"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#888480] transition-colors hover:text-[#edebe8]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Connectors
        </Link>

        <h1 className="text-2xl font-bold">MCP Directory</h1>
        <p className="mt-2 text-sm text-[#888480]">
          Community and official MCP servers. Copy a server URL and paste it into the custom
          connector dialog to connect instantly.
        </p>

        <div className="mt-8 space-y-3">
          {FEATURED_MCPS.map((mcp) => (
            <div
              key={mcp.name}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#edebe8]">{mcp.name}</p>
                  <p className="mt-0.5 text-xs text-[#888480]">{mcp.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mcp.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#555150]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <a
                  href={mcp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-[#888480] transition-colors hover:border-white/[0.12] hover:text-[#edebe8]"
                >
                  View
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="text-sm font-medium">Browse all MCP servers</p>
          <p className="mt-1 text-xs text-[#888480]">
            The official MCP registry lists hundreds of community-contributed servers.
          </p>
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#c8892a] transition-colors hover:text-[#d49a3a]"
          >
            Open MCP registry
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
