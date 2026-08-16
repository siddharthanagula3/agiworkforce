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

export async function findInGitHubRestPages<T>(
  options: FindInGitHubRestPagesOptions<T>,
): Promise<T | null> {
  if (!Number.isSafeInteger(options.perPage) || options.perPage <= 0) {
    throw new Error('GitHub REST pagination requires a positive page size');
  }
  if (!Number.isSafeInteger(options.maxPages) || options.maxPages <= 0) {
    throw new Error('GitHub REST pagination requires a positive page limit');
  }

  for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber += 1) {
    const page = await options.loadPage(pageNumber);
    const match = page.items.find(options.matches);
    if (match) return match;

    const hasNext =
      page.linkHeader !== undefined && page.linkHeader !== null
        ? linkHeaderHasNext(page.linkHeader)
        : page.items.length === options.perPage &&
          (page.totalCount === undefined || pageNumber * options.perPage < page.totalCount);
    if (!hasNext) return null;
  }

  throw new Error(`GitHub REST pagination exceeded ${options.maxPages} pages`);
}
