import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
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
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · local',
  },
  {
    name: 'Git',
    description: 'Repository status, diffs, branches, and commits.',
    pkg: 'mcp-server-git',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · developer',
  },
  {
    name: 'GitHub',
    description: 'Repos, issues, and pull requests via the GitHub API.',
    pkg: '@modelcontextprotocol/server-github',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · developer',
  },
  {
    name: 'Postgres',
    description: 'Query and manage PostgreSQL databases.',
    pkg: '@modelcontextprotocol/server-postgres',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · database',
  },
  {
    name: 'Slack',
    description: 'Post messages and read channels via the Slack API.',
    pkg: '@modelcontextprotocol/server-slack',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · productivity',
  },
  {
    name: 'Memory',
    description: 'Persistent knowledge-graph storage for long-term context.',
    pkg: '@modelcontextprotocol/server-memory',
    url: 'https://github.com/modelcontextprotocol/servers',
    tags: 'stdio · data',
  },
];

export default function McpDirectoryPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section id="mcp-directory-hero" labelledBy="agi-mcp-directory-title" size="lg">
          <Stack gap="loose">
            <div>
              <Eyebrow>Connectors · MCP reference servers</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-mcp-directory-title">
                A short list, not a registry.
              </h1>
            </div>
            <Prose size="lg">
              We do not host a browsable or searchable MCP directory, and there is no plan date for
              one. Every server below is a stdio process, so it runs on Desktop or the CLI, not in
              the browser. Desktop&rsquo;s built-in server browser installs each of these by name.
              To search the full catalogue of community servers, use the official MCP registry.
            </Prose>
            <ButtonRow>
              <Button href="https://modelcontextprotocol.io/registry/about">
                Open the MCP registry
              </Button>
              <Button href="/connectors" variant="secondary">
                Back to connectors
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <Section
          id="reference-servers"
          labelledBy="agi-mcp-directory-servers-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>Installable from Desktop · stdio</Eyebrow>
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
                    {mcp.description} <code>{mcp.pkg}</code>
                  </>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="mcp-directory-close" labelledBy="agi-mcp-directory-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-mcp-directory-close-title">
              Bring your own tools.
            </h2>
            <Prose>
              The official MCP registry lists hundreds of community-contributed servers. We do not
              mirror, curate, or sign any of them. On the web, the custom connector dialog accepts a
              remote HTTP or SSE MCP endpoint and your own token; stdio servers like the ones above
              have no URL, so add those from Desktop or the CLI instead.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
