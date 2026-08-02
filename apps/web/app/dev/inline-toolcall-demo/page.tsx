// apps/web/app/dev/inline-toolcall-demo/page.tsx
//
// R23 lane A · static-render smoke-test harness for the R22 inline tool-call
// badge visual (commits 9707de324 → e361da768).
//
// SYNTHETIC DATA: this harness hand-crafts InlineToolCall / InlineToolCallGroup
// / WebSearchCard props so we can verify the visual without a live provider +
// tool-use loop. This route is a visual harness only and does not prove BYOK or
// managed-cloud runtime availability.
//
// Reference image: ~/Desktop/reference/ui/desktop/claude-artifacts/02_*.png and
// 06_*.png. This page renders all the badge variants in a column so the
// captured screenshot can be diffed visually side-by-side with Claude.
//
// Read-only on app code · this is the only new mount we add for the smoke test.

'use client';

import {
  InlineToolCall,
  InlineToolCallGroup,
  WebSearchCard,
  type WebSearchResultItem,
} from '@agiworkforce/unified-chat';

const FILESYSTEM_RESULTS: WebSearchResultItem[] = [
  {
    url: 'https://www.anthropic.com/news/claude-4-7',
    title: 'Introducing a new provider model release',
    domain: 'anthropic.com',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=32',
  },
  {
    url: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    title: 'Tool use with Claude · Anthropic API documentation',
    domain: 'docs.anthropic.com',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=32',
  },
  {
    url: 'https://github.com/anthropics/anthropic-cookbook',
    title: 'anthropics/anthropic-cookbook: A collection of notebooks/recipes',
    domain: 'github.com',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=github.com&sz=32',
  },
  {
    url: 'https://en.wikipedia.org/wiki/Artificial_general_intelligence',
    title: 'Artificial general intelligence · Wikipedia',
    domain: 'en.wikipedia.org',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32',
  },
  {
    url: 'https://news.ycombinator.com/item?id=12345678',
    title: 'AGI Workforce launches in private beta · Hacker News',
    domain: 'news.ycombinator.com',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=ycombinator.com&sz=32',
  },
];

export default function InlineToolCallDemoPage() {
  // SIX-24: `app/dev/layout.tsx` already 404s this whole segment under
  // NODE_ENV=production (a real 404 status, unlike the 200-with-empty-body this
  // branch produces). Kept as defence-in-depth for the case where that layout
  // is removed.
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="min-h-screen bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto max-w-3xl px-8 py-12 font-sans">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">
            R22 inline tool-call badge · static smoke-test harness
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Synthetic props. Reference:{' '}
            <code className="font-mono text-xs">
              ~/Desktop/reference/ui/desktop/claude-artifacts/02_*.png, 06_*.png, 08_*.png
            </code>
          </p>
        </header>

        {/* ── Block 1 · Reference parity (image 02): Filesystem integration ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-base font-medium text-stone-700 dark:text-stone-300">
            Block 1 · Filesystem integration group (image 02 parity)
          </h2>
          <div
            data-testid="block-filesystem-group"
            className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-6"
          >
            <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools">
              <InlineToolCall
                id="t-loading"
                label="Loading tools"
                status="success"
                kind="mcp-custom"
                iconStyle="badge"
              />
              <InlineToolCall
                id="t-allowed-dirs"
                label="List Allowed Directories"
                status="success"
                kind="fs-list"
                iconStyle="badge"
              />
              <InlineToolCall
                id="t-list-1"
                label="List Directory"
                status="success"
                kind="fs-list"
                iconStyle="badge"
              />
              <InlineToolCall
                id="t-list-2"
                label="List Directory"
                status="success"
                kind="fs-list"
                iconStyle="badge"
              />
              <InlineToolCall
                id="t-list-3"
                label="List Directory"
                status="success"
                kind="fs-list"
                iconStyle="badge"
              />
              <InlineToolCall
                id="t-done"
                label="Done"
                status="success"
                kind="done"
                iconStyle="badge"
              />
            </InlineToolCallGroup>
          </div>
        </section>

        {/* ── Block 2 · All badge letter / glyph variants ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-base font-medium text-stone-700 dark:text-stone-300">
            Block 2 · All InlineToolKind → badge variants
          </h2>
          <div
            data-testid="block-all-kinds"
            className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-6 space-y-1"
          >
            <InlineToolCall
              id="k-bash"
              label="Bash"
              status="success"
              kind="bash"
              iconStyle="badge"
              argSummary="ls -la"
            />
            <InlineToolCall
              id="k-read"
              label="Read File"
              status="success"
              kind="read"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-write"
              label="Write File"
              status="success"
              kind="write"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-edit"
              label="Edit File"
              status="success"
              kind="edit"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-fs-list"
              label="List Directory"
              status="success"
              kind="fs-list"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-web-search"
              label="Web Search"
              status="success"
              kind="web-search"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-web-fetch"
              label="Web Fetch"
              status="success"
              kind="web-fetch"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-image"
              label="Image Gen"
              status="success"
              kind="image-gen"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-browser"
              label="Browser Click"
              status="success"
              kind="browser"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-mcp"
              label="MCP Custom Tool"
              status="success"
              kind="mcp-custom"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-thinking"
              label="Thinking"
              status="running"
              kind="thinking"
              iconStyle="badge"
            />
            <InlineToolCall
              id="k-done"
              label="Done"
              status="success"
              kind="done"
              iconStyle="badge"
            />
          </div>
        </section>

        {/* ── Block 3 · Lifecycle states ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-base font-medium text-stone-700 dark:text-stone-300">
            Block 3 · Lifecycle states (pending / running / success / error / partial)
          </h2>
          <div
            data-testid="block-states"
            className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-6 space-y-1"
          >
            <InlineToolCall
              id="s-pending"
              label="Read File"
              status="pending"
              kind="read"
              iconStyle="badge"
            />
            <InlineToolCall
              id="s-running"
              label="Read File"
              status="running"
              kind="read"
              iconStyle="badge"
            />
            <InlineToolCall
              id="s-success"
              label="Read File"
              status="success"
              kind="read"
              iconStyle="badge"
            />
            <InlineToolCall
              id="s-error"
              label="Read File"
              status="error"
              kind="read"
              iconStyle="badge"
              errorMessage="ENOENT: no such file"
            />
            <InlineToolCall
              id="s-partial"
              label="Read File"
              status="partial"
              kind="read"
              iconStyle="badge"
            />
          </div>
        </section>

        {/* ── Block 4 · Web search card (image 06 parity) ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-base font-medium text-stone-700 dark:text-stone-300">
            Block 4 · WebSearchCard with favicons (image 06 parity)
          </h2>
          <div
            data-testid="block-web-search"
            className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-6"
          >
            <WebSearchCard
              query="agi workforce claude opus 5 release"
              resultCount={5}
              results={FILESYSTEM_RESULTS}
            />
          </div>
        </section>

        {/* ── Block 5 · Multi-row group, compact (image 08 parity) ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-base font-medium text-stone-700 dark:text-stone-300">
            Block 5 · Compact stacked tool messages (image 08 parity)
          </h2>
          <div
            data-testid="block-compact"
            className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 p-6"
          >
            <InlineToolCallGroup integrationName="Brave Search" summary="3 queries">
              <InlineToolCall
                id="bs-1"
                label="Brave Search"
                status="success"
                kind="web-search"
                iconStyle="badge"
                argSummary="agi workforce claude opus 5"
              />
              <InlineToolCall
                id="bs-2"
                label="Brave Search"
                status="success"
                kind="web-search"
                iconStyle="badge"
                argSummary="anthropic tool-use api"
              />
              <InlineToolCall
                id="bs-3"
                label="Brave Search"
                status="success"
                kind="web-search"
                iconStyle="badge"
                argSummary="filesystem mcp server"
              />
              <InlineToolCall
                id="bs-done"
                label="Done"
                status="success"
                kind="done"
                iconStyle="badge"
              />
            </InlineToolCallGroup>
          </div>
        </section>

        <footer className="mt-12 border-t border-stone-200 dark:border-stone-800 pt-4 text-xs text-stone-500">
          Smoke-test harness · synthetic props, no live provider connection.{' '}
          <span data-testid="harness-marker">R23-LANE-A</span>
        </footer>
      </div>
    </div>
  );
}
