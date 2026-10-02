import { releasePath } from '@/lib/changelog-entries';
import { LEGAL_ENTITY } from '@/lib/legal-constants';
import { archivedVersionHref, policyChanges } from '@/lib/legal/policy-archive';
import { SITE_NAME, absoluteUrl } from '@/lib/seo/site';

import { RELEASE_NOTES, releaseStateLine } from './release-notes-data';

export const ATOM_MEDIA_TYPE = 'application/atom+xml';

const CHANGELOG_PATH = '/changelog';

export const CHANGELOG_FEED_PATH = `${CHANGELOG_PATH}/feed.xml`;

export const CHANGELOG_FEED_TITLE = `${SITE_NAME} changelog`;

export const CHANGELOG_FEED_LINKS = {
  [ATOM_MEDIA_TYPE]: [{ url: CHANGELOG_FEED_PATH, title: CHANGELOG_FEED_TITLE }],
};

const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';

const DATE_AT_END = /(\d{4}-\d{2})(-\d{2})?$/;

const MIDDAY_UTC = 'T12:00:00Z';

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

interface FeedEntry {
  id: string;
  title: string;
  updated: string;
  link: string;
  paragraphs: readonly string[];
  categories: readonly { term: string; label: string }[];
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

function atomTimestamp(date: string): string {
  const [, yearMonth, day] = DATE_AT_END.exec(date) ?? [];
  if (!yearMonth) throw new Error(`The changelog date "${date}" does not end in a calendar date`);
  return `${yearMonth}${day ?? '-01'}${MIDDAY_UTC}`;
}

function releaseEntries(): FeedEntry[] {
  return RELEASE_NOTES.map((note) => {
    const page = absoluteUrl(releasePath(note));
    return {
      id: page,
      title: note.headline,
      updated: atomTimestamp(note.date),
      link: page,
      paragraphs: [`${note.date} · ${releaseStateLine(note)}`, ...note.body],
      categories: [{ term: 'release', label: 'Release' }],
    };
  });
}

function policyEntries(): FeedEntry[] {
  return policyChanges().map((change) => ({
    id: absoluteUrl(archivedVersionHref(change.history, change.date)),
    title: `${change.history.label} updated`,
    updated: atomTimestamp(change.date),
    link: absoluteUrl(change.href),
    paragraphs: [`${change.date} · ${change.history.label}`, change.summary],
    categories: [
      { term: 'policy', label: 'Policy change' },
      { term: change.history.slug, label: change.history.label },
    ],
  }));
}

function renderEntry(entry: FeedEntry): string {
  const html = entry.paragraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`).join('');
  return [
    '  <entry>',
    `    <id>${escapeXml(entry.id)}</id>`,
    `    <title>${escapeXml(entry.title)}</title>`,
    `    <updated>${escapeXml(entry.updated)}</updated>`,
    `    <link rel="alternate" type="text/html" href="${escapeXml(entry.link)}"/>`,
    ...entry.categories.map(
      (category) =>
        `    <category term="${escapeXml(category.term)}" label="${escapeXml(category.label)}"/>`,
    ),
    `    <content type="html">${escapeXml(html)}</content>`,
    '  </entry>',
  ].join('\n');
}

export function renderAtomFeed(entries: readonly FeedEntry[]): string {
  const ordered = [...entries].sort((left, right) => right.updated.localeCompare(left.updated));
  const [newest] = ordered;
  if (!newest) throw new Error('The changelog feed has no entry to date it by');
  const self = absoluteUrl(CHANGELOG_FEED_PATH);
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="${ATOM_NAMESPACE}">`,
    `  <id>${escapeXml(self)}</id>`,
    `  <title>${escapeXml(CHANGELOG_FEED_TITLE)}</title>`,
    '  <subtitle>Dated releases and policy changes, newest first.</subtitle>',
    `  <link rel="self" type="${ATOM_MEDIA_TYPE}" href="${escapeXml(self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(absoluteUrl(CHANGELOG_PATH))}"/>`,
    `  <updated>${escapeXml(newest.updated)}</updated>`,
    '  <author>',
    `    <name>${escapeXml(LEGAL_ENTITY)}</name>`,
    `    <uri>${escapeXml(absoluteUrl('/'))}</uri>`,
    '  </author>',
    ...ordered.map(renderEntry),
    '</feed>',
    '',
  ].join('\n');
}

export function changelogFeed(): string {
  return renderAtomFeed([...releaseEntries(), ...policyEntries()]);
}
