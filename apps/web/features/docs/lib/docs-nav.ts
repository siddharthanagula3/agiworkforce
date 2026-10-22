import { documentationIndex } from '@/app/docs/doc-index';

export interface DocsNavLink {
  href: string;
  title: string;
}

export interface DocsNavGroup {
  id: string;
  label: string;
  links: readonly DocsNavLink[];
}

export const DOCS_HOME_PATH = '/docs';

const OVERVIEW_GROUP: DocsNavGroup = {
  id: 'overview',
  label: 'Documentation',
  links: [
    { href: DOCS_HOME_PATH, title: 'Overview' },
    { href: '/api-docs', title: 'API reference' },
  ],
};

export function docsNavGroups(): readonly DocsNavGroup[] {
  const { groups } = documentationIndex();
  return [
    OVERVIEW_GROUP,
    ...groups.map((group) => ({
      id: group.id,
      label: group.label,
      links: group.entries.map((entry) => ({ href: entry.href, title: entry.title })),
    })),
  ];
}

export function docsSearchLinks(): readonly DocsNavLink[] {
  return OVERVIEW_GROUP.links;
}

export function docsNeighbours(
  groups: readonly DocsNavGroup[],
  href: string,
): { previous: DocsNavLink | null; next: DocsNavLink | null } {
  const pages = groups.filter((group) => group.id !== OVERVIEW_GROUP.id).flatMap((g) => g.links);
  const index = pages.findIndex((page) => page.href === href);
  if (index === -1) return { previous: null, next: null };
  return { previous: pages[index - 1] ?? null, next: pages[index + 1] ?? null };
}

export const RELATED_ARTICLE_LIMIT = 3;

export function docsRelated(
  groups: readonly DocsNavGroup[],
  href: string,
  limit = RELATED_ARTICLE_LIMIT,
): readonly DocsNavLink[] {
  const group = groups.find(
    (candidate) =>
      candidate.id !== OVERVIEW_GROUP.id && candidate.links.some((link) => link.href === href),
  );
  if (!group) return [];
  const index = group.links.findIndex((link) => link.href === href);
  const following = [...group.links.slice(index + 1), ...group.links.slice(0, index)];
  return following.slice(0, limit);
}
