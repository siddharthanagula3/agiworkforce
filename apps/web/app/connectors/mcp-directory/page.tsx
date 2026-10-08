import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  MarketingFooter,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import { getSnapshotView } from '@/lib/connectors/directory/memory-cache';
import {
  DEFAULT_LIST_SHORT_BELOW,
  isEligibleForListing,
  isInDefaultListing,
} from '@/lib/connectors/directory/listing';
import { isConnectableNow } from '@/lib/connectors/directory/snapshot-view';
import { helpEntryPoint, helpHref } from '@/lib/support/help-entry-points';
import { CLI_AVAILABILITY_NOTE } from '@/lib/surface-status';
import { DirectoryRecordCard } from './DirectoryRecordCard';
import {
  BADGE_NOTE,
  BASE_PATH,
  COMMUNITY_VIEW,
  COMMUNITY_VIEW_NOTICE,
  DEFAULT_VIEW_LINK_LABEL,
  SHORT_LIST_COMMUNITY_LINK_LABEL,
  SHORT_LIST_NOTICE,
  SIGN_IN_HREF,
  VIEW_PARAM,
} from './directory-public';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import '@/features/marketing/components/pages/company/company.css';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'MCP connector directory',
  description:
    'Browse indexed remote MCP servers, inspect their publisher and listed tools, then sign in to connect one.',
  path: '/connectors/mcp-directory',
});

const PAGE_SIZE = 60;
const SEARCH_PARAM = 'q';
const CATEGORY_PARAM = 'category';
const ALL_CATEGORIES_LABEL = 'All';
const SEARCH_INPUT_ID = 'agi-mcp-directory-search';
const CATEGORY_SELECT_ID = 'agi-mcp-directory-category';

const PILL_CLASS =
  'inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm text-foreground pointer-coarse:min-h-11 aria-[current=page]:border-foreground aria-[current=page]:font-medium';

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

function href(search: string, category: string, community = false): string {
  const params = new URLSearchParams();
  if (community) params.set(VIEW_PARAM, COMMUNITY_VIEW);
  if (search) params.set(SEARCH_PARAM, search);
  if (category) params.set(CATEGORY_PARAM, category);
  const query = params.toString();
  return query ? `${BASE_PATH}?${query}` : BASE_PATH;
}

function activeFilterSummary(search: string, category: string): string {
  if (search && category) return `Matching "${search}" in ${category}.`;
  if (search) return `Matching "${search}".`;
  return `In ${category}.`;
}

export default async function McpDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchText = firstValue(params[SEARCH_PARAM]);
  const search = searchText.toLowerCase();
  const category = firstValue(params[CATEGORY_PARAM]);
  const community = firstValue(params[VIEW_PARAM]) === COMMUNITY_VIEW;
  const filtered = Boolean(search || category);

  const view = await getSnapshotView();
  const selected = view.records.filter(
    (record) =>
      isConnectableNow(record) &&
      isEligibleForListing(record) &&
      (community || isInDefaultListing(record)) &&
      matches(record, search) &&
      (!category || record.categories.includes(category)),
  );
  const page = selected.slice(0, PAGE_SIZE);
  const truncated = selected.length > page.length;
  const total = selected.length.toLocaleString();
  const shortList = !community && !filtered && selected.length < DEFAULT_LIST_SHORT_BELOW;

  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-mcp-directory-title"
          eyebrow="Connectors · MCP directory"
          title="Find a connector for your work."
          lede="Search the remote MCP servers indexed here. Open a listing to inspect its publisher and tools before you connect."
          ctas={[
            { href: SIGN_IN_HREF, label: 'Sign in to connect' },
            {
              href: 'https://modelcontextprotocol.io/registry/about',
              label: 'About the MCP registry',
              variant: 'secondary',
            },
          ]}
        />

        <Section id="results" size="xs" labelledBy="agi-mcp-directory-list-title" rule>
          <Stack gap="tight" className="agi-ds-full">
            <h2 className="agi-ds-h2" id="agi-mcp-directory-list-title" tabIndex={-1}>
              Browse the directory.
            </h2>
            <div role="status" aria-atomic="true">
              <Prose>
                {total} {selected.length === 1 ? 'connector' : 'connectors'}
                {view.bootstrapComplete ? '' : ' indexed so far'}
                {truncated ? `, showing the first ${page.length.toLocaleString()}` : ''}
              </Prose>
            </div>

            <form
              action={`${BASE_PATH}#agi-mcp-directory-list-title`}
              method="get"
              role="search"
              aria-label="Search connectors"
              className="flex w-full flex-wrap items-end gap-3"
            >
              {community ? <input type="hidden" name={VIEW_PARAM} value={COMMUNITY_VIEW} /> : null}
              <div className="agi-ds-field min-w-0 flex-1 basis-64">
                <label htmlFor={SEARCH_INPUT_ID} className="text-sm font-medium text-foreground">
                  Search connectors
                </label>
                <input
                  id={SEARCH_INPUT_ID}
                  type="search"
                  name={SEARCH_PARAM}
                  defaultValue={searchText}
                  placeholder="Name, publisher or tool"
                  className="agi-ds-input"
                />
              </div>
              <div className="agi-ds-field w-full sm:hidden">
                <label htmlFor={CATEGORY_SELECT_ID} className="text-sm font-medium text-foreground">
                  Category
                </label>
                <select
                  id={CATEGORY_SELECT_ID}
                  name={CATEGORY_PARAM}
                  defaultValue={category}
                  className="agi-ds-input"
                >
                  <option value="">{ALL_CATEGORIES_LABEL}</option>
                  {DIRECTORY_CATEGORIES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="agi-ds-btn" data-variant="secondary">
                Search
              </button>
            </form>

            {shortList ? (
              <Prose>
                {SHORT_LIST_NOTICE}{' '}
                <Link href={href('', '', true)} className="agi-ds-link">
                  {SHORT_LIST_COMMUNITY_LINK_LABEL}
                </Link>
              </Prose>
            ) : null}
            {community ? (
              <Prose>
                {COMMUNITY_VIEW_NOTICE}{' '}
                <Link href={href(searchText, category)} className="agi-ds-link">
                  {DEFAULT_VIEW_LINK_LABEL}
                </Link>
              </Prose>
            ) : null}

            <Prose>
              Servers that run as a local process have no URL, so those are added from the CLI.{' '}
              {CLI_AVAILABILITY_NOTE}
            </Prose>

            <nav aria-label="Categories" className="hidden w-full flex-wrap gap-2 sm:flex">
              <Link
                href={href(searchText, '', community)}
                aria-current={category ? undefined : 'page'}
                className={PILL_CLASS}
              >
                {ALL_CATEGORIES_LABEL}
              </Link>
              {DIRECTORY_CATEGORIES.map((name) => (
                <Link
                  key={name}
                  href={href(searchText, name, community)}
                  aria-current={category === name ? 'page' : undefined}
                  className={PILL_CLASS}
                >
                  {name}
                </Link>
              ))}
            </nav>

            {filtered ? (
              <Prose>
                {activeFilterSummary(searchText, category)}{' '}
                <Link href={href('', '', community)} className="agi-ds-link">
                  Clear filters
                </Link>
              </Prose>
            ) : null}

            {page.length === 0 ? (
              <Prose>
                {view.bootstrapComplete
                  ? 'No indexed connector matches that search yet.'
                  : 'The directory is still being indexed, so this search may be incomplete. Try again shortly.'}
              </Prose>
            ) : (
              <ul className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {page.map((record) => (
                  <DirectoryRecordCard key={record.id} record={record} />
                ))}
              </ul>
            )}

            {truncated ? (
              <Prose>
                Showing the first {page.length.toLocaleString()} of {total}. Search or choose a
                category to narrow the list, or{' '}
                <Link href={SIGN_IN_HREF} className="agi-ds-link">
                  sign in
                </Link>{' '}
                to browse all of them.
              </Prose>
            ) : null}
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby="agi-mcp-directory-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-mcp-directory-close-title">
                Bring <em className="agi-ds-accent">your own tools.</em>
              </h2>
              <Prose size="lg">
                {BADGE_NOTE} Signed in, the custom connector dialog also accepts any remote HTTP or
                SSE MCP endpoint and your own token, and every tool a connector offers stays behind
                your per-tool permission.
              </Prose>
              <ButtonRow>
                <Button href={SIGN_IN_HREF}>Sign in to connect</Button>
                <Button href={helpHref('connectors')} variant="secondary">
                  {helpEntryPoint('connectors').label}
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
