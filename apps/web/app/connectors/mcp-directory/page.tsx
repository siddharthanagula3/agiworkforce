import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'MCP reference servers',
  description:
    'A short hand-picked list of stdio MCP servers Desktop can install. This is not a browsable registry, use the official MCP registry for that.',
  path: '/connectors/mcp-directory',
});

const REFERENCE_MCPS = [
  {
    name: 'Filesystem',
    description: 'Read and write files on your local machine.',
    pkg: '@modelcontextprotocol/server-filesystem',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    tags: 'stdio · local',
  },
  {
    name: 'Git',
    description: 'Repository status, diffs, branches, and commits.',
    pkg: 'mcp-server-git',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    tags: 'stdio · developer',
  },
  {
    name: 'GitHub',
    description: 'Repos, issues, and pull requests via the GitHub API.',
    pkg: '@modelcontextprotocol/server-github',
    url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github',
    tags: 'stdio · developer',
  },
  {
    name: 'Postgres',
    description: 'Query and manage PostgreSQL databases.',
    pkg: '@modelcontextprotocol/server-postgres',
    url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres',
    tags: 'stdio · database',
  },
  {
    name: 'Slack',
    description: 'Post messages and read channels via the Slack API.',
    pkg: '@modelcontextprotocol/server-slack',
    url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack',
    tags: 'stdio · productivity',
  },
  {
    name: 'Memory',
    description: 'Persistent knowledge-graph storage for long-term context.',
    pkg: '@modelcontextprotocol/server-memory',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    tags: 'stdio · data',
  },
] as const;

export default function McpDirectoryPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-mcp-directory-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Connectors &middot; MCP reference servers</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-mcp-directory-title">
                A short list, <em className="agi-ds-accent">not a registry.</em>
              </h1>
              <Prose size="lg">
                We do not host a browsable or searchable MCP directory, and there is no plan date
                for one. Every server below is a stdio process, so it runs on Desktop or the CLI,
                not in the browser. Desktop&rsquo;s built-in server browser installs each by name.
              </Prose>
              <ButtonRow>
                <Button href="https://modelcontextprotocol.io/registry/about">
                  Open the MCP registry
                </Button>
                <Button href="/connectors" variant="secondary">
                  Back to connectors
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <pre className="agi-lp-terminal" aria-label="The reference servers, by package name">
                <span className="agi-lp-terminal-line" data-kind="cmd">
                  agi plugin list
                </span>
                {REFERENCE_MCPS.map((mcp) => (
                  <span className="agi-lp-terminal-line" data-kind="dim" key={mcp.name}>
                    {mcp.pkg}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mcp-directory-servers-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Installable from Desktop &middot; stdio</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mcp-directory-servers-title">
                The reference servers.
              </h2>
            </div>
            <LinkGrid
              items={REFERENCE_MCPS.map((mcp) => ({
                meta: mcp.tags,
                title: mcp.name,
                href: mcp.url,
                external: true,
                body: (
                  <>
                    {mcp.description}
                    <br />
                    <code>{mcp.pkg}</code>
                  </>
                ),
              }))}
            />
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-mcp-directory-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-mcp-directory-close-title">
                Bring <em className="agi-ds-accent">your own tools.</em>
              </h2>
              <Prose size="lg">
                The official MCP registry lists hundreds of community-contributed servers. We do not
                mirror, curate, or sign any of them. On the web, the custom connector dialog accepts
                a remote HTTP or SSE MCP endpoint and your own token; stdio servers like the ones
                above have no URL, so add those from Desktop or the CLI instead.
              </Prose>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
