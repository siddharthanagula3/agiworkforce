import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Plug,
  FolderOpen,
  GitBranch,
  Search,
  Database,
  Wrench,
  ArrowRight,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'MCP Integrations | AGI Workforce',
  description:
    'Connect any MCP server to AGI Workforce. Filesystem, Git, web search, databases, and custom tools over stdio, SSE, or streamable HTTP.',
  alternates: { canonical: 'https://agiworkforce.com/integrations' },
};

const mcpCategories = [
  {
    icon: FolderOpen,
    title: 'Filesystem',
    description:
      'Read, write, search, and manage files on your local machine or network storage. Respects your OS-level permissions.',
  },
  {
    icon: GitBranch,
    title: 'Git / Version Control',
    description:
      'Read diffs, commit histories, blame output, and branch metadata. Useful for code review and change summarization.',
  },
  {
    icon: Search,
    title: 'Web Search',
    description:
      'Attach search APIs (Brave, Perplexity, etc.) as MCP tools so the agent can fetch current information mid-conversation.',
  },
  {
    icon: Database,
    title: 'Databases',
    description:
      'Query SQL or NoSQL databases via MCP. Return structured data directly into the conversation context.',
  },
  {
    icon: Wrench,
    title: 'Custom Tools',
    description:
      'Wrap any CLI, REST API, or internal service as an MCP server. If it has a schema, AGI Workforce can call it.',
  },
  {
    icon: Plug,
    title: 'Third-party MCP Servers',
    description:
      'Any community or vendor MCP server that speaks stdio, SSE, or streamable HTTP works without modification.',
  },
];

const transports = [
  { label: 'stdio', note: 'Local process, zero network overhead.' },
  { label: 'SSE', note: 'Server-sent events over HTTP for remote servers.' },
  { label: 'Streamable HTTP', note: 'Modern MCP transport for hosted endpoints.' },
];

export default function IntegrationsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Plug className="mr-2 h-4 w-4" />
              MCP Integrations
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#edebe8] md:text-6xl">
              MCP servers. Your tools, your way.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[#888480]">
              Model Context Protocol lets any tool speak directly to the AI. AGI Workforce supports
              all three MCP transports out of the box.
            </p>
          </div>
        </section>

        {/* What is MCP */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-4 text-xl font-bold text-[#edebe8]">What is MCP?</h2>
              <p className="mb-4 text-[#888480] leading-relaxed">
                The Model Context Protocol (MCP) is an open standard for connecting AI models to
                external tools and data sources. Instead of custom integrations per tool, you
                describe a tool once as an MCP server, and any MCP-compatible client (like AGI
                Workforce) can call it.
              </p>
              <p className="text-[#888480] leading-relaxed">
                AGI Workforce supports MCP across Desktop and CLI surfaces. Any MCP server with
                stdio, SSE, or streamable HTTP transport works, including community servers and
                tools you build yourself.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {transports.map((t) => (
                  <div
                    key={t.label}
                    className="rounded-lg border border-[#1a1917] bg-[#09090b] px-4 py-3"
                  >
                    <div className="font-mono text-sm font-semibold text-[#c8892a]">{t.label}</div>
                    <div className="mt-0.5 text-xs text-[#888480]">{t.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Categories Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="mb-10 text-center text-2xl font-bold text-[#edebe8]">
              What you can connect
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {mcpCategories.map((cat) => (
                <div
                  key={cat.title}
                  className="rounded-xl border border-[#1a1917] bg-black/50 p-6 transition-colors hover:border-[#c8892a]/30"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                    <cat.icon className="h-5 w-5 text-[#c8892a]" />
                  </div>
                  <h3 className="mb-2 font-semibold text-[#edebe8]">{cat.title}</h3>
                  <p className="text-sm leading-relaxed text-[#888480]">{cat.description}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-[#555150]">
              We do not audit third-party MCP servers. Review any server you install before granting
              it access to sensitive data.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="bg-black py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-xl font-bold text-[#edebe8]">How to add an MCP server</h2>
              <ol className="space-y-4">
                {[
                  'Open AGI Workforce Desktop or CLI.',
                  'Go to Settings > MCP Servers (Desktop) or edit ~/.agiworkforce/config.toml (CLI).',
                  "Add your server's transport config: command (stdio), URL (SSE/HTTP), and optional environment variables.",
                  "The server's tools appear automatically in the chat sidebar. Select which tools the agent can use.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c8892a]/10 border border-[#c8892a]/30 text-xs font-bold text-[#c8892a]">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm text-[#888480]">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  href="/features/plugins"
                  className="inline-flex items-center gap-2 text-sm text-[#c8892a] hover:underline"
                >
                  Technical plugin docs
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Coming soon: marketplace */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl rounded-xl border border-[#1a1917] bg-[#09090b] p-8 text-center">
              <Zap className="mx-auto mb-4 h-8 w-8 text-[#c8892a]" />
              <h2 className="mb-2 text-lg font-bold text-[#edebe8]">
                Server marketplace coming soon
              </h2>
              <p className="text-sm text-[#888480]">
                We are building a curated directory of reviewed MCP servers you can install in one
                click. Until then, any MCP server with stdio, SSE, or streamable HTTP transport
                works today.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-md border border-[#1a1917] px-5 py-2 text-sm font-medium text-[#888480] transition-colors hover:bg-[#1a1917] hover:text-[#edebe8]"
                >
                  Read the docs
                </Link>
                <div className="flex items-center gap-2 text-sm text-[#555150]">
                  <CheckCircle2 className="h-4 w-4 text-[#c8892a]" />
                  Works with any spec-compliant MCP server today
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
