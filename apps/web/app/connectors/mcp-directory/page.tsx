import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import { getSnapshotView } from '@/lib/connectors/directory/memory-cache';
import { isConnectableNow } from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryBadge, DirectoryRecord } from '@/lib/connectors/directory/types';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'MCP connector directory',
  description:
    'Browse every remote MCP server this deployment indexes, from the official Model Context Protocol registry and from vendors publishing their own. Sign in to connect one.',
  path: '/connectors/mcp-directory',
});

const PAGE_SIZE = 60;
const SEARCH_PARAM = 'q';
const CATEGORY_PARAM = 'category';
const BASE_PATH = '/connectors/mcp-directory';
const SIGN_IN_HREF = '/login?redirectTo=%2Fconnectors';
const ALL_CATEGORIES_LABEL = 'All';

const BADGE_LABELS: Record<DirectoryBadge, string> = {
  'first-party': 'First-party',
  official: 'Official',
  verified: 'Verified',
  registry: 'Community',
  community: 'Community',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function matches(record: DirectoryRecord, needle: string): boolean {
  if (!needle) return true;
  return [record.name, record.publisher, record.description, ...record.toolNames]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function href(search: string, category: string): string {
  const params = new URLSearchParams();
  if (search) params.set(SEARCH_PARAM, search);
  if (category) params.set(CATEGORY_PARAM, category);
  const query = params.toString();
  return query ? `${BASE_PATH}?${query}` : BASE_PATH;
}

function iconHref(record: DirectoryRecord): string | null {
  return record.iconUrl
    ? `/api/connectors/directory/icon?id=${encodeURIComponent(record.id)}`
    : null;
}

export default async function McpDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = firstValue(params[SEARCH_PARAM]).toLowerCase();
  const category = firstValue(params[CATEGORY_PARAM]);

  const view = await getSnapshotView();
  const selected = view.records.filter(
    (record) =>
      isConnectableNow(record) &&
      matches(record, search) &&
      (!category || record.categories.includes(category)),
  );
  const page = selected.slice(0, PAGE_SIZE);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-mcp-directory-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Connectors &middot; MCP directory</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-mcp-directory-title">
                Every remote MCP server, <em className="agi-ds-accent">in one place.</em>
              </h1>
              <Prose size="lg">
                These are the remote servers this deployment indexes, from the official Model
                Context Protocol registry and from vendors who publish their own. Each entry says
                who published it. Sign in to connect one to a conversation. Servers that run as a
                local process have no URL, so those are added from Desktop or the CLI instead.
              </Prose>
              <ButtonRow>
                <Button href={SIGN_IN_HREF}>Sign in to connect</Button>
                <Button href="https://modelcontextprotocol.io/registry/about" variant="secondary">
                  About the MCP registry
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mcp-directory-list-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>
                {selected.length.toLocaleString()}{' '}
                {selected.length === 1 ? 'connector' : 'connectors'}
                {view.bootstrapComplete ? '' : ' indexed so far'}
              </Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mcp-directory-list-title">
                Browse the directory.
              </h2>
            </div>

            <form action={BASE_PATH} method="get" className="mb-6 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="agi-mcp-directory-search">
                Search connectors
              </label>
              <input
                id="agi-mcp-directory-search"
                type="search"
                name={SEARCH_PARAM}
                defaultValue={firstValue(params[SEARCH_PARAM])}
                placeholder="Search connectors"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
              />
              {category ? <input type="hidden" name={CATEGORY_PARAM} value={category} /> : null}
              <button
                type="submit"
                className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-medium text-foreground"
              >
                Search
              </button>
            </form>

            <nav aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
              <Link
                href={href(firstValue(params[SEARCH_PARAM]), '')}
                aria-current={category ? undefined : 'page'}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground aria-[current=page]:text-foreground"
              >
                {ALL_CATEGORIES_LABEL}
              </Link>
              {DIRECTORY_CATEGORIES.map((name) => (
                <Link
                  key={name}
                  href={href(firstValue(params[SEARCH_PARAM]), name)}
                  aria-current={category === name ? 'page' : undefined}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground aria-[current=page]:text-foreground"
                >
                  {name}
                </Link>
              ))}
            </nav>

            {page.length === 0 ? (
              <Prose>
                {view.bootstrapComplete
                  ? 'No indexed connector matches that search yet.'
                  : 'The directory is still being indexed, so this search may be incomplete. Try again shortly.'}
              </Prose>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {page.map((record) => {
                  const icon = iconHref(record);
                  return (
                    <li
                      key={record.id}
                      className="flex flex-col gap-2 rounded-xl border border-border p-4"
                    >
                      <div className="flex items-center gap-2.5">
                        {icon ? (
                          <img
                            src={icon}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 rounded-md"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground"
                          >
                            {record.monogram}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {record.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {BADGE_LABELS[record.badge]}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {record.description}
                      </p>
                      <p className="mt-auto text-xs text-muted-foreground">
                        {record.publisher}
                        {record.toolNames.length > 0
                          ? ` · ${record.toolNames.length} ${record.toolNames.length === 1 ? 'tool' : 'tools'}`
                          : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected.length > page.length ? (
              <Prose>
                Showing the first {page.length.toLocaleString()}. Sign in to search and filter the
                whole directory.
              </Prose>
            ) : null}
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-mcp-directory-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-mcp-directory-close-title">
                Bring <em className="agi-ds-accent">your own tools.</em>
              </h2>
              <Prose size="lg">
                We do not sign or vouch for a community server; the badge on each entry says who
                published it and nothing more. Signed in, the custom connector dialog also accepts
                any remote HTTP or SSE MCP endpoint and your own token, and every tool a connector
                offers stays behind your per-tool permission.
              </Prose>
              <ButtonRow>
                <Button href={SIGN_IN_HREF}>Sign in to connect</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
