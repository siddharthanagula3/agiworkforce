export interface GitHubRestPage<T> {
  items: readonly T[];
  totalCount?: number;
  linkHeader?: string | null;
}

export interface FindInGitHubRestPagesOptions<T> {
  loadPage: (page: number) => Promise<GitHubRestPage<T>>;
  matches: (item: T) => boolean;
  perPage: number;
  maxPages: number;
}

function linkHeaderHasNext(linkHeader: string): boolean {
  return linkHeader.split(',').some((entry) =>
    entry
      .split(';')
      .slice(1)
      .some((parameter) => {
        const separator = parameter.indexOf('=');
        if (separator < 0) return false;
        const name = parameter.slice(0, separator).trim().toLowerCase();
        if (name !== 'rel') return false;
        const value = parameter
          .slice(separator + 1)
          .trim()
          .replace(/^"|"$/g, '');
        return value.split(/\s+/).includes('next');
      }),
  );
}

function assertPaginationBounds(perPage: number, maxPages: number): void {
  if (!Number.isSafeInteger(perPage) || perPage <= 0) {
    throw new Error('GitHub REST pagination requires a positive page size');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
    throw new Error('GitHub REST pagination requires a positive page limit');
  }
}

function pageHasNext<T>(page: GitHubRestPage<T>, pageNumber: number, perPage: number): boolean {
  if (page.linkHeader !== undefined && page.linkHeader !== null) {
    return linkHeaderHasNext(page.linkHeader);
  }
  return (
    page.items.length === perPage &&
    (page.totalCount === undefined || pageNumber * perPage < page.totalCount)
  );
}

export async function findInGitHubRestPages<T>(
  options: FindInGitHubRestPagesOptions<T>,
): Promise<T | null> {
  assertPaginationBounds(options.perPage, options.maxPages);

  for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber += 1) {
    const page = await options.loadPage(pageNumber);
    const match = page.items.find(options.matches);
    if (match) return match;

    if (!pageHasNext(page, pageNumber, options.perPage)) return null;
  }

  throw new Error(`GitHub REST pagination exceeded ${options.maxPages} pages`);
}

export interface CollectGitHubRestPagesOptions<T> {
  loadPage: (page: number) => Promise<GitHubRestPage<T>>;
  perPage: number;
  maxPages: number;
  /** Stops early once this many items are held, so a huge account still answers. */
  maxItems: number;
}

export interface CollectedGitHubRestPages<T> {
  items: T[];
  /** True when pages remained that the item or page ceiling stopped us reading. */
  truncated: boolean;
}

/**
 * Reads a whole GitHub collection instead of searching it, bounded on both
 * axes. Exceeding the page limit is not an error here the way it is for a
 * search: a listing that returns the first N of a large account with
 * `truncated` set is usable, where a throw would leave the caller with nothing.
 */
export async function collectGitHubRestPages<T>(
  options: CollectGitHubRestPagesOptions<T>,
): Promise<CollectedGitHubRestPages<T>> {
  assertPaginationBounds(options.perPage, options.maxPages);
  if (!Number.isSafeInteger(options.maxItems) || options.maxItems <= 0) {
    throw new Error('GitHub REST pagination requires a positive item limit');
  }

  const items: T[] = [];
  for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber += 1) {
    const page = await options.loadPage(pageNumber);
    for (const item of page.items) {
      if (items.length >= options.maxItems) return { items, truncated: true };
      items.push(item);
    }

    if (!pageHasNext(page, pageNumber, options.perPage)) return { items, truncated: false };
    if (items.length >= options.maxItems) return { items, truncated: true };
  }
  return { items, truncated: true };
}
