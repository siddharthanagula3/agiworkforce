import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Code,
  Database,
  FolderOpen,
  Globe,
  Image,
  Infinity as InfinityIcon,
  MonitorSmartphone,
  Plug,
  Search,
  Server,
  Terminal,
  Wifi,
  Zap,
} from 'lucide-react';
import { Header } from '../../../components/layout/Header';
import { CtaSection } from '../../../components/marketing/CtaSection';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Plugins & MCP Tools | AGI Workforce',
  description:
    'Unlimited MCP tool ecosystem for AGI Workforce. Connect any MCP server — file systems, databases, APIs, browsers, and more. No artificial limits, no tool caps. Supports stdio, SSE, and HTTP transports.',
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
      'Unlimited MCP tool ecosystem. Connect any MCP server — file systems, databases, APIs, browsers, and more. No artificial limits.',
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
  name: 'Plugins & MCP Tools — AGI Workforce',
  description:
    'Unlimited MCP tool ecosystem for AGI Workforce. Connect any MCP server — file systems, databases, APIs, browsers, and more.',
  url: 'https://agiworkforce.com/features/plugins',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
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

const transports = [
  {
    icon: MonitorSmartphone,
    name: 'stdio',
    label: 'Local Processes',
    description:
      'Run MCP servers as local child processes. Ideal for file system tools, code analysis, and local databases that need direct system access.',
    example: 'npx @modelcontextprotocol/server-filesystem',
  },
  {
    icon: Wifi,
    name: 'SSE',
    label: 'Server-Sent Events',
    description:
      'Connect to remote MCP servers via streaming SSE. Perfect for long-running tools, real-time data feeds, and cloud-hosted services.',
    example: 'https://mcp.example.com/sse',
  },
  {
    icon: Globe,
    name: 'HTTP',
    label: 'Streamable HTTP',
    description:
      'Standard REST-based MCP connections for stateless tool calls. Works with any HTTP-compatible server, proxy, or API gateway.',
    example: 'https://api.example.com/mcp',
  },
];

const toolCategories = [
  {
    icon: FolderOpen,
    name: 'File System',
    description: 'Read, write, search, and manage files across your system',
    tools: ['file-read', 'file-write', 'file-search'],
  },
  {
    icon: Globe,
    name: 'Browser Automation',
    description: 'Navigate, click, fill forms, extract data from any website',
    tools: ['puppeteer', 'playwright', 'web-scraper'],
  },
  {
    icon: Database,
    name: 'Database',
    description: 'Query SQLite, PostgreSQL, MySQL databases directly',
    tools: ['sqlite', 'postgres', 'mysql'],
  },
  {
    icon: Terminal,
    name: 'Terminal & Shell',
    description: 'Execute commands, manage processes, automate workflows',
    tools: ['bash', 'powershell', 'ssh'],
  },
  {
    icon: Cloud,
    name: 'Cloud APIs',
    description: 'Connect to GitHub, Slack, Notion, Google Drive, and more',
    tools: ['github', 'slack', 'google-drive'],
  },
  {
    icon: Code,
    name: 'Code Analysis',
    description: 'AST parsing, linting, refactoring, and code generation',
    tools: ['tree-sitter', 'eslint', 'prettier'],
  },
  {
    icon: Image,
    name: 'Image & Media',
    description: 'Generate, edit, and analyze images and media files',
    tools: ['sharp', 'ffmpeg', 'vision-api'],
  },
  {
    icon: Search,
    name: 'Search & Research',
    description: 'Web search, documentation lookup, knowledge retrieval',
    tools: ['brave-search', 'rag', 'context7'],
  },
];

const comparisonFeatures = [
  {
    feature: 'MCP Tool Count',
    agi: 'Unlimited',
    cursor: '40-tool cap',
    claude: 'Limited',
  },
  {
    feature: 'Transport Types',
    agi: 'stdio + SSE + HTTP',
    cursor: 'stdio only',
    claude: 'stdio + SSE',
  },
  {
    feature: 'Custom Servers',
    agi: 'Any MCP server',
    cursor: 'Curated list',
    claude: 'Manual config',
  },
  {
    feature: 'Auto-Discovery',
    agi: 'Full auto-discovery',
    cursor: 'Partial',
    claude: 'None',
  },
  {
    feature: 'Tool Sandboxing',
    agi: 'ToolGuard + per-tool permissions',
    cursor: 'Basic',
    claude: 'Basic',
  },
];

const steps = [
  {
    number: '01',
    title: 'Add MCP servers to .mcp.json',
    description:
      'Define your MCP servers in a simple JSON config file. Specify the transport type, command or URL, and any arguments.',
  },
  {
    number: '02',
    title: 'Auto-discover available tools',
    description:
      'AGI Workforce connects to each server and discovers all available tools automatically. No manual registration needed.',
  },
  {
    number: '03',
    title: 'Use tools naturally in conversation',
    description:
      'Simply ask your AI agent to perform tasks. It selects and invokes the right MCP tools behind the scenes.',
  },
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

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Plugins - AGI Workforce',
  description: 'Extend AGI Workforce with plugins for any workflow or integration.',
  url: 'https://agiworkforce.com/features/plugins',
  isPartOf: { '@type': 'WebSite', name: 'AGI Workforce', url: 'https://agiworkforce.com' },
};

export default function PluginsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />

        <main className="flex-1 pt-24">
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
            <div className="container relative mx-auto px-4 text-center">
              <div className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-blue-400 backdrop-blur-xs">
                <Plug className="mr-2 h-4 w-4" />
                MCP Tool Ecosystem
              </div>
              <h1 className="mx-auto max-w-4xl bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
                Unlimited Tools via Model Context Protocol
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
                Connect any MCP server — file systems, databases, APIs, browsers, and more. No
                artificial limits, no tool caps.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/download"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-black"
                >
                  Download Desktop App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="#tools"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-800 bg-black px-8 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Explore Tools
                </Link>
              </div>

              <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:justify-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <InfinityIcon className="h-4 w-4 text-blue-500" />
                  <span>Unlimited Tools</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Server className="h-4 w-4 text-blue-500" />
                  <span>3 Transport Types</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <span>Zero Caps</span>
                </div>
              </div>
            </div>
          </section>

          {/* How MCP Works */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  How MCP Works
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Think of MCP like USB-C for AI — one standard protocol to connect any tool. AGI
                  Workforce speaks all three MCP transport types natively.
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {transports.map((transport) => (
                  <div
                    key={transport.name}
                    className="group rounded-2xl border border-zinc-800 bg-black/50 p-8 transition-all hover:border-blue-500/50"
                  >
                    <transport.icon className="mb-4 h-10 w-10 text-blue-500" />
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
                      {transport.name}
                    </div>
                    <h3 className="mb-3 text-xl font-semibold">{transport.label}</h3>
                    <p className="mb-4 leading-relaxed text-zinc-400">{transport.description}</p>
                    <code className="block rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-500">
                      {transport.example}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tool Categories Grid */}
          <section id="tools" className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Tool Categories
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  From file management to web search, MCP tools cover every capability your AI agent
                  needs. Install community servers or build your own.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {toolCategories.map((category) => (
                  <div
                    key={category.name}
                    className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xs transition-all hover:border-blue-500/50 hover:bg-white/[0.08]"
                  >
                    <category.icon className="mb-4 h-8 w-8 text-blue-500" />
                    <h3 className="mb-2 text-lg font-semibold">{category.name}</h3>
                    <p className="mb-4 text-sm leading-relaxed text-zinc-400">
                      {category.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.tools.map((tool) => (
                        <span
                          key={tool}
                          className="rounded-full border border-zinc-700 bg-zinc-800/50 px-2.5 py-0.5 text-xs text-zinc-400"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Comparison Section */}
          <section className="bg-zinc-950 py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  No Artificial Limits
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Other tools cap your MCP connections or restrict transport types. AGI Workforce
                  gives you the full protocol — unlimited.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="p-4 text-left text-sm font-medium text-zinc-500">Feature</th>
                      <th className="p-4 text-left text-sm font-semibold text-blue-400">
                        AGI Workforce
                      </th>
                      <th className="p-4 text-left text-sm font-medium text-zinc-500">Cursor</th>
                      <th className="p-4 text-left text-sm font-medium text-zinc-500">
                        Claude Desktop
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((row) => (
                      <tr key={row.feature} className="border-b border-zinc-800/50">
                        <td className="p-4 text-sm text-zinc-400">{row.feature}</td>
                        <td className="p-4 text-sm font-medium text-white">
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            {row.agi}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-zinc-500">{row.cursor}</td>
                        <td className="p-4 text-sm text-zinc-500">{row.claude}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Getting Started */}
          <section className="bg-black py-24">
            <div className="container mx-auto px-4">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
                  Get Started in 3 Steps
                </h2>
                <p className="mx-auto max-w-2xl text-zinc-400">
                  Set up MCP tools in minutes. No complex infrastructure, no server management —
                  just a JSON config file.
                </p>
              </div>
              <div className="grid gap-12 lg:grid-cols-2">
                <div className="space-y-8">
                  {steps.map((step) => (
                    <div key={step.number} className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                        {step.number}
                      </div>
                      <div>
                        <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                        <p className="leading-relaxed text-zinc-400">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-blue-500/10 blur-xl" />
                  <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                    <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                      <div className="flex gap-1.5">
                        <div className="h-3 w-3 rounded-full bg-zinc-700" />
                        <div className="h-3 w-3 rounded-full bg-zinc-700" />
                        <div className="h-3 w-3 rounded-full bg-zinc-700" />
                      </div>
                      <span className="text-xs text-zinc-500">.mcp.json</span>
                    </div>
                    <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
                      <code className="text-zinc-300">{mcpConfigExample}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <CtaSection
            icon="Plug"
            headline="Extend Your AI with Any Tool"
            body="Connect unlimited MCP servers. Use community tools or build your own. No caps, no restrictions — just the full power of the Model Context Protocol."
            secondaryLabel="Read Documentation"
            secondaryHref="/docs"
          />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
