import { stripMarkupTags } from '@/lib/markup-tags';

import {
  CLAUDE_CLI_INSTALL_COMMAND,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  PUBLIC_DIRECTORY_PAGE_LIMIT,
  PUBLIC_DIRECTORY_REQUEST_SPACING_MS,
  PUBLIC_DIRECTORY_URL,
  PUBLIC_DIRECTORY_USER_AGENT,
  PUBLIC_DIRECTORY_VERIFIED_LABEL,
  PUBLIC_DIRECTORY_WORKS_WITH_LABELS,
} from './constants';
import { normalizeRepositoryUrl, type DirectoryFetch } from './official-marketplace';
import type { PluginWorksWith, PublicDirectoryCard, PublicDirectoryDetail } from './types';

const CARD_OPEN = '<div role="listitem" class="stories_cms_item w-dyn-item">';
const CARD_CLOSE = '</a></div>';
const SLUG_PATTERN = /href="\/plugins\/([a-z0-9-]+)"/;
const NAME_MARKER = 'fs-list-field="name"';
const NAME_TEXT_PATTERN = /([^<]*)</y;
const HEADING_CLOSE = '</h3>';
const PARAGRAPH_OPEN = '<p';
const PARAGRAPH_CLOSE = '</p>';
const INSTALLS_MARKER = 'format-number';
const INSTALLS_TEXT_PATTERN = /([\d,.]+)</y;
const WORKS_WITH_MARKER = 'fs-list-field="works-with">';
const PAGE_PARAM_PATTERN = /\?([a-z0-9]+_page)=2\b/;
const COPY_COMMAND_PATTERN = /data-copy="([^"]*)"/g;
const GITHUB_LINK_PATTERN = /href="(https:\/\/github\.com\/[^"#?]+)"/g;
const ANGLE_BRACKET_PATTERN = /[<>]/g;
const WHITESPACE_RUN_PATTERN = /\s+/g;
const TAG_STRIP_MAX_PASSES = 8;
const ENTITY_PATTERN = /&(amp|quot|#x27|#39|lt|gt|nbsp);/g;
const ENTITY_VALUES: Readonly<Record<string, string>> = {
  amp: '&',
  quot: '"',
  '#x27': "'",
  '#39': "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

function stripTags(value: string): string {
  let current = value;
  for (let pass = 0; pass < TAG_STRIP_MAX_PASSES; pass += 1) {
    const next = stripMarkupTags(current);
    if (next === current) return current;
    current = next;
  }
  return current.replace(ANGLE_BRACKET_PATTERN, '');
}

function decodeText(value: string | undefined): string {
  if (!value) return '';
  const decoded = value.replace(ENTITY_PATTERN, (_, entity: string) => ENTITY_VALUES[entity] ?? '');
  return stripTags(decoded).replace(WHITESPACE_RUN_PATTERN, ' ').trim();
}

function parseInstalls(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = Number(raw.replace(/[,.]/g, ''));
  return Number.isFinite(digits) ? digits : null;
}

export function worksWithFromLabel(label: string): PluginWorksWith | null {
  const value = PUBLIC_DIRECTORY_WORKS_WITH_LABELS[decodeText(label)];
  return (value as PluginWorksWith | undefined) ?? null;
}

function directoryCards(html: string): string[] {
  const items: string[] = [];
  let cursor = 0;
  for (let open = html.indexOf(CARD_OPEN); open !== -1; open = html.indexOf(CARD_OPEN, cursor)) {
    const bodyStart = open + CARD_OPEN.length;
    const close = html.indexOf(CARD_CLOSE, bodyStart);
    if (close === -1) break;
    items.push(html.slice(bodyStart, close));
    cursor = close + CARD_CLOSE.length;
  }
  return items;
}

function textAfterMarker(item: string, marker: string, text: RegExp): string | undefined {
  const lastTextEnd = item.lastIndexOf('<');
  let tagClose = -1;
  let tried = -1;
  for (let at = item.indexOf(marker); at !== -1; at = item.indexOf(marker, at + 1)) {
    if (tagClose < at + marker.length) tagClose = item.indexOf('>', at + marker.length);
    if (tagClose === -1 || tagClose > lastTextEnd) return undefined;
    if (tagClose === tried) continue;
    tried = tagClose;
    text.lastIndex = tagClose + 1;
    const found = text.exec(item);
    if (found) return found[1];
  }
  return undefined;
}

function listedTexts(item: string, marker: string): string[] {
  const texts: string[] = [];
  let cursor = 0;
  for (let at = item.indexOf(marker); at !== -1; at = item.indexOf(marker, cursor)) {
    const textStart = at + marker.length;
    const close = item.indexOf('<', textStart);
    if (close === -1) break;
    texts.push(item.slice(textStart, close));
    cursor = close + 1;
  }
  return texts;
}

function descriptionOf(item: string): string | undefined {
  const heading = item.indexOf(HEADING_CLOSE);
  if (heading === -1) return undefined;
  const paragraph = item.indexOf(PARAGRAPH_OPEN, heading + HEADING_CLOSE.length);
  if (paragraph === -1) return undefined;
  const paragraphTagClose = item.indexOf('>', paragraph + PARAGRAPH_OPEN.length);
  if (paragraphTagClose === -1) return undefined;
  const textEnd = item.indexOf(PARAGRAPH_CLOSE, paragraphTagClose + 1);
  return textEnd === -1 ? undefined : item.slice(paragraphTagClose + 1, textEnd);
}

export function parseDirectoryListing(html: string): PublicDirectoryCard[] {
  const cards: PublicDirectoryCard[] = [];
  for (const item of directoryCards(html)) {
    const slug = SLUG_PATTERN.exec(item)?.[1];
    if (!slug) continue;
    const worksWith = new Set<PluginWorksWith>();
    for (const label of listedTexts(item, WORKS_WITH_MARKER)) {
      const value = worksWithFromLabel(label);
      if (value) worksWith.add(value);
    }
    cards.push({
      slug,
      name: decodeText(textAfterMarker(item, NAME_MARKER, NAME_TEXT_PATTERN)) || slug,
      description: decodeText(descriptionOf(item)),
      verified: item.toLowerCase().includes(PUBLIC_DIRECTORY_VERIFIED_LABEL.toLowerCase()),
      installs: parseInstalls(textAfterMarker(item, INSTALLS_MARKER, INSTALLS_TEXT_PATTERN)),
      worksWith: [...worksWith],
    });
  }
  return cards;
}

export function parseDirectoryPageParam(html: string): string | null {
  return PAGE_PARAM_PATTERN.exec(html)?.[1] ?? null;
}

export function parseDirectoryDetailInstallCommand(html: string): string | null {
  for (const match of html.matchAll(COPY_COMMAND_PATTERN)) {
    const command = decodeText(match[1]);
    if (command.startsWith(CLAUDE_CLI_INSTALL_COMMAND)) return command;
  }
  return null;
}

export function parseDirectoryDetailRepository(html: string): string | null {
  for (const match of html.matchAll(GITHUB_LINK_PATTERN)) {
    const normalized = normalizeRepositoryUrl(decodeText(match[1]));
    if (normalized) return normalized;
  }
  return null;
}

export function parseDirectoryDetail(html: string): PublicDirectoryDetail {
  return {
    installCommand: parseDirectoryDetailInstallCommand(html),
    repositoryUrl: parseDirectoryDetailRepository(html),
  };
}

export function directoryDetailUrl(slug: string): string {
  return `${PUBLIC_DIRECTORY_URL}/${slug}`;
}

function directoryPageUrl(pageParam: string | null, page: number): string {
  if (page === 1 || !pageParam) return PUBLIC_DIRECTORY_URL;
  return `${PUBLIC_DIRECTORY_URL}?${pageParam}=${page}`;
}

async function fetchHtml(url: string, fetchImpl: DirectoryFetch): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': PUBLIC_DIRECTORY_USER_AGENT },
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return response.text();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PublicDirectoryFetchResult {
  cards: PublicDirectoryCard[];
  pagesFetched: number;
  complete: boolean;
}

export async function fetchPublicDirectory(
  fetchImpl: DirectoryFetch = fetch,
  deadlineMs: number = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
): Promise<PublicDirectoryFetchResult> {
  const seen = new Map<string, PublicDirectoryCard>();
  let pageParam: string | null = null;
  let pagesFetched = 0;
  let complete = false;
  for (let page = 1; page <= PUBLIC_DIRECTORY_PAGE_LIMIT; page += 1) {
    if (now() >= deadlineMs) break;
    const html = await fetchHtml(directoryPageUrl(pageParam, page), fetchImpl);
    if (html === null) break;
    pagesFetched += 1;
    if (page === 1) pageParam = parseDirectoryPageParam(html);
    const before = seen.size;
    for (const card of parseDirectoryListing(html)) {
      if (!seen.has(card.slug)) seen.set(card.slug, card);
    }
    if (seen.size === before || !pageParam) {
      complete = true;
      break;
    }
    await wait(PUBLIC_DIRECTORY_REQUEST_SPACING_MS);
  }
  return { cards: [...seen.values()], pagesFetched, complete };
}

export async function fetchDirectoryDetail(
  slug: string,
  fetchImpl: DirectoryFetch = fetch,
): Promise<PublicDirectoryDetail | null> {
  const html = await fetchHtml(directoryDetailUrl(slug), fetchImpl);
  return html === null ? null : parseDirectoryDetail(html);
}

export function directoryRequestSpacing(): Promise<void> {
  return wait(PUBLIC_DIRECTORY_REQUEST_SPACING_MS);
}
