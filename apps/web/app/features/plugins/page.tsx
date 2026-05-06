import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Cloud,
  Code,
  Database,
  FolderOpen,
  Globe,
  Image,
  Plug,
  Search,
  Server,
  Terminal,
  Wifi,
} from 'lucide-react';
import { EditorialPage } from '../../../components/marketing/editorial/EditorialPage';
import { DispatchSection } from '../../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'Plugins & MCP Tools | AGI Workforce',
  description:
    'Unlimited MCP tool ecosystem for AGI Workforce. Connect any MCP server - file systems, databases, APIs, browsers, and more. No artificial limits, no tool caps. Supports stdio, SSE, and HTTP transports.',
  keywords: [
    'MCP tools',
    'Model Context Protocol',
    'AI plugins',
    'MCP server',
    'AI tools',
    'desktop AI agent',
    'tool ecosystem',
    'stdio',
    'SSE',
    'HTTP transport',
    'AGI Workforce',
  ],
  openGraph: {
    title: 'Plugins & MCP Tools | AGI Workforce',
    description:
      'Unlimited MCP tool ecosystem. Connect any MCP server - file systems, databases, APIs, browsers, and more. No artificial limits.',
    type: 'website',
    url: 'https://agiworkforce.com/features/plugins',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Plugins & MCP Tools',
      },
    ],
  },
  alternates: {
    canonical: '/features/plugins',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plugins & MCP Tools | AGI Workforce',
    description:
      'Unlimited MCP tool ecosystem. Connect any MCP server with zero tool caps. Supports stdio, SSE, and HTTP transports.',
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Plugins & MCP Tools - AGI Workforce',
  description:
    'Unlimited MCP tool ecosystem for AGI Workforce. Connect any MCP server - file systems, databases, APIs, browsers, and more.',
  url: 'https://agiworkforce.com/features/plugins',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Linux (Windows coming Q3 2026)',
    featureList: [
      'Unlimited MCP tool support',
      'stdio transport for local processes',
      'SSE transport for server-sent events',
      'HTTP transport for REST APIs',
      'Auto-discovery of MCP tools',
      'File system, browser, database, terminal tools',
      'Cloud API integrations',
      'Custom MCP server support',
    ],
  },
};

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Plugins - AGI Workforce',
  description: 'Extend AGI Workforce with plugins for any workflow or integration.',
  url: 'https://agiworkforce.com/features/plugins',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

const transports = [
  {
    icon: Terminal,
    name: 'stdio',
    label: 'Local Processes',
    desc: 'Child processes with direct system access. File tools, code analysis, local databases.',
    example: 'npx @modelcontextprotocol/server-filesystem',
  },
  {
    icon: Wifi,
    name: 'SSE',
    label: 'Server-Sent Events',
    desc: 'Streaming connections to remote servers. Real-time data, long-running tasks, cloud services.',
    example: 'https://mcp.example.com/sse',
  },
  {
    icon: Globe,
    name: 'HTTP',
    label: 'Streamable HTTP',
    desc: 'Stateless REST-based calls. Any HTTP-compatible server, proxy, or API gateway.',
    example: 'https://api.example.com/mcp',
  },
];

const toolCategories = [
  { icon: FolderOpen, name: 'File System', tools: ['file-read', 'file-write', 'file-search'] },
  { icon: Globe, name: 'Browser', tools: ['puppeteer', 'playwright', 'web-scraper'] },
  { icon: Database, name: 'Database', tools: ['sqlite', 'postgres', 'mysql'] },
  { icon: Terminal, name: 'Terminal', tools: ['bash', 'powershell', 'ssh'] },
  { icon: Cloud, name: 'Cloud APIs', tools: ['github', 'slack', 'google-drive'] },
  { icon: Code, name: 'Code Analysis', tools: ['tree-sitter', 'eslint', 'prettier'] },
  { icon: Image, name: 'Image & Media', tools: ['sharp', 'ffmpeg', 'vision-api'] },
  { icon: Search, name: 'Search', tools: ['brave-search', 'rag', 'context7'] },
];

const mcpConfigExample = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/you/projects"
      ]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "$GITHUB_TOKEN"
      }
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://localhost/mydb"
      ]
    }
  }
}`;

export default function PluginsPage() {
  return (
    <EditorialPage tier="paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
        <div className="flex-1 pt-24">
          {/* Hero */}
          <section className="py-20 md:py-28">
            <div className="mx-auto max-w-3xl px-6 text-center">
              <div className="mb-6 inline-flex items-center gap-2 border border-zinc-800 px-3 py-1 text-sm text-[#888480]">
                <Plug className="h-3.5 w-3.5 text-[#c8892a]" />
                Model Context Protocol
              </div>
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Connect Any Tool via MCP
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#888480]">
                stdio, SSE, and HTTP transports. No tool caps, no curated lists. Point at an MCP
                server and every tool is available immediately.
              </p>
              <div className="mt-8 flex items-center justify-center gap-4">
                <Link
                  href="/download"
                  className="inline-flex h-10 items-center gap-2 bg-[#c8892a] px-6 text-sm font-medium text-[#09090b] transition-colors hover:bg-[#d49a3a]"
                >
                  Download
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="#config"
                  className="inline-flex h-10 items-center border border-zinc-800 px-6 text-sm text-[#888480] transition-colors hover:border-zinc-700 hover:text-[#edebe8]"
                >
                  See Config
                </Link>
              </div>
            </div>
          </section>

          {/* Config Block */}
          <section id="config" className="pb-20 md:pb-28">
            <div className="mx-auto max-w-3xl px-6">
              <div className="border border-zinc-800 bg-black">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                  <span className="font-mono text-xs text-[#888480]">.mcp.json</span>
                  <span className="text-[10px] uppercase tracking-wider text-[#555150]">
                    Drop this in your project root
                  </span>
                </div>
                <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
                  <code className="text-[#888480]">{mcpConfigExample}</code>
                </pre>
              </div>
              <p className="mt-4 text-sm text-[#555150]">
                Every tool on every server is discovered automatically. Add a server, restart, done.
              </p>
            </div>
          </section>

          {/* Transports - horizontal row */}
          <section className="border-y border-zinc-800/50 py-20 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
              <h2 className="mb-2 text-2xl font-semibold tracking-tight md:text-3xl">
                Three Transports
              </h2>
              <p className="mb-12 text-[#555150]">
                Local processes, streaming connections, and stateless HTTP. All native.
              </p>
              <div className="grid gap-px border border-zinc-800 bg-zinc-800 md:grid-cols-3">
                {transports.map((t) => (
                  <div key={t.name} className="bg-[#09090b] p-6">
                    <div className="mb-3 flex items-center gap-3">
                      <t.icon className="h-4 w-4 text-[#c8892a]" />
                      <span className="font-mono text-sm font-medium">{t.name}</span>
                      <span className="text-xs text-[#555150]">{t.label}</span>
                    </div>
                    <p className="mb-4 text-sm leading-relaxed text-[#888480]">{t.desc}</p>
                    <code className="block font-mono text-xs text-[#555150]">{t.example}</code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tool Categories - compact grid */}
          <section id="tools" className="py-20 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
              <h2 className="mb-2 text-2xl font-semibold tracking-tight md:text-3xl">
                Tool Categories
              </h2>
              <p className="mb-12 text-[#555150]">
                Community servers or your own. Every category below has open-source MCP servers
                ready to install.
              </p>
              <div className="grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
                {toolCategories.map((cat) => (
                  <div key={cat.name} className="bg-[#09090b] p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <cat.icon className="h-4 w-4 text-[#c8892a]" />
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tools.map((tool) => (
                        <span key={tool} className="font-mono text-xs text-[#555150]">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Adding a server - concrete example */}
          <section className="border-t border-zinc-800/50 py-20 md:py-24">
            <div className="mx-auto max-w-3xl px-6">
              <h2 className="mb-2 text-2xl font-semibold tracking-tight md:text-3xl">
                Example: Add a GitHub Server
              </h2>
              <p className="mb-8 text-[#555150]">
                One entry in your config. The agent discovers every tool the server exposes.
              </p>
              <div className="border border-zinc-800 bg-black">
                <div className="border-b border-zinc-800 px-4 py-2.5">
                  <span className="font-mono text-xs text-[#888480]">.mcp.json</span>
                </div>
                <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
                  <code className="text-[#888480]">{`{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "$GITHUB_TOKEN" }
    }
  }
}`}</code>
                </pre>
              </div>
              <div className="mt-6 space-y-3 text-sm text-[#888480]">
                <div className="flex items-start gap-3">
                  <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                  <span>
                    AGI Workforce spawns the process, calls{' '}
                    <code className="font-mono text-[#555150]">tools/list</code>, and registers
                    every tool - create issues, manage PRs, search repos, read files.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Plug className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c8892a]" />
                  <span>
                    ToolGuard assigns permission tiers automatically. Read operations run freely;
                    writes require confirmation.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <DispatchSection slugIndex="04" slugKicker="DISPATCH" />
        </div>
      </div>
    </EditorialPage>
  );
}
