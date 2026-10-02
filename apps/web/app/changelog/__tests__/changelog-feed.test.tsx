import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RELEASES, releasePath } from '@/lib/changelog-entries';
import { policyChanges } from '@/lib/legal/policy-archive';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import ChangelogPage, { metadata as changelogMetadata } from '../page';
import { GET } from '../feed.xml/route';
import { metadata as releaseNotesMetadata } from '../../release-notes/page';
import {
  CHANGELOG_FEED_PATH,
  CHANGELOG_FEED_TITLE,
  renderAtomFeed,
} from '../../release-notes/changelog-feed';

const ATOM = 'http://www.w3.org/2005/Atom';
const RFC_3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseXml(xml: string): Document {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
  return parsed;
}

async function servedFeed(): Promise<Element> {
  return parseXml(await GET().text()).documentElement;
}

function atomChildren(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(
    (node) => node.namespaceURI === ATOM && node.localName === name,
  );
}

function atomChild(parent: Element, name: string): Element {
  const [found] = atomChildren(parent, name);
  if (!found) throw new Error(`<${parent.localName}> has no <${name}>`);
  return found;
}

function text(parent: Element, name: string): string {
  return atomChild(parent, name).textContent ?? '';
}

function linkHref(parent: Element, rel: string): string {
  const link = atomChildren(parent, 'link').find((node) => node.getAttribute('rel') === rel);
  return link?.getAttribute('href') ?? '';
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

function contentHtml(entry: Element): Document {
  return new DOMParser().parseFromString(text(entry, 'content'), 'text/html');
}

function categoryTerms(entry: Element): (string | null)[] {
  return atomChildren(entry, 'category').map((node) => node.getAttribute('term'));
}

describe('/changelog/feed.xml', () => {
  it('serves a well-formed Atom document under the Atom media type', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');

    const feed = parseXml(await response.text()).documentElement;
    expect(feed.namespaceURI).toBe(ATOM);
    expect(feed.localName).toBe('feed');
  });

  it('carries every element RFC 4287 requires of a feed, with absolute links', async () => {
    const feed = await servedFeed();

    expect(isAbsoluteHttpUrl(text(feed, 'id'))).toBe(true);
    expect(text(feed, 'title')).toBe(CHANGELOG_FEED_TITLE);
    expect(text(feed, 'updated')).toMatch(RFC_3339);
    expect(text(atomChild(feed, 'author'), 'name')).not.toBe('');
    expect(new URL(linkHref(feed, 'self')).pathname).toBe('/changelog/feed.xml');
    expect(new URL(linkHref(feed, 'alternate')).pathname).toBe('/changelog');
  });

  it('gives every entry a unique absolute id, a title, an update time, a link and HTML content', async () => {
    const entries = atomChildren(await servedFeed(), 'entry');
    expect(new Set(entries.map((entry) => text(entry, 'id'))).size).toBe(entries.length);

    for (const entry of entries) {
      const id = text(entry, 'id');
      expect(isAbsoluteHttpUrl(id), id).toBe(true);
      expect(text(entry, 'title'), id).not.toBe('');
      expect(text(entry, 'updated'), id).toMatch(RFC_3339);
      expect(Number.isNaN(Date.parse(text(entry, 'updated'))), id).toBe(false);
      expect(isAbsoluteHttpUrl(linkHref(entry, 'alternate')), id).toBe(true);
      expect(atomChild(entry, 'content').getAttribute('type'), id).toBe('html');
      expect(contentHtml(entry).querySelectorAll('p').length, id).toBeGreaterThan(0);
    }
  });

  it('lists every release and every policy revision, newest first, and is dated by the newest', async () => {
    const feed = await servedFeed();
    const updated = atomChildren(feed, 'entry').map((entry) => text(entry, 'updated'));

    expect(updated).toHaveLength(RELEASES.length + policyChanges().length);
    expect([...updated].sort().reverse()).toEqual(updated);
    expect(text(feed, 'updated')).toBe(updated[0]);
  });

  it('dates a release that spans months by the first day of the month it ends in', async () => {
    const entries = atomChildren(await servedFeed(), 'entry');
    const span = entries.find((entry) =>
      text(entry, 'id').endsWith(releasePath({ date: '2026-02 to 2026-05' })),
    );

    expect(span).toBeDefined();
    if (span) expect(text(span, 'updated')).toBe('2026-05-01T00:00:00Z');
  });

  it('carries every subprocessor list change the subprocessors page says can be followed', async () => {
    const entries = atomChildren(await servedFeed(), 'entry').filter((entry) =>
      categoryTerms(entry).includes('subprocessors'),
    );
    const changes = policyChanges().filter((change) => change.history.key === 'subprocessors');

    expect(changes.length).toBeGreaterThan(0);
    expect(entries.map((entry) => text(entry, 'updated'))).toEqual(
      changes.map((change) => `${change.date}T00:00:00Z`),
    );
    entries.forEach((entry, index) => {
      expect(categoryTerms(entry)).toContain('policy');
      expect(contentHtml(entry).body.textContent).toBe(changes[index]?.summary);
    });
  });

  it('escapes markup and entities in text, attributes and HTML content', () => {
    const hostile = `Fish & <chips> "quoted" 'single' ]]>`;
    const address = 'https://example.com/notes?first=1&second=2';
    const feed = parseXml(
      renderAtomFeed([
        {
          id: address,
          title: hostile,
          updated: '2026-01-01T00:00:00Z',
          link: address,
          paragraphs: [hostile, '<script>alert(1)</script>'],
          categories: [{ term: 'a&b', label: '<label>' }],
        },
      ]),
    ).documentElement;
    const entry = atomChild(feed, 'entry');

    expect(text(entry, 'title')).toBe(hostile);
    expect(text(entry, 'id')).toBe(address);
    expect(linkHref(entry, 'alternate')).toBe(address);
    expect(atomChild(entry, 'category').getAttribute('term')).toBe('a&b');
    expect(atomChild(entry, 'category').getAttribute('label')).toBe('<label>');
    expect(feed.getElementsByTagName('script')).toHaveLength(0);

    const html = contentHtml(entry);
    expect(html.querySelector('script')).toBeNull();
    expect(Array.from(html.querySelectorAll('p'), (node) => node.textContent)).toEqual([
      hostile,
      '<script>alert(1)</script>',
    ]);
  });
});

describe('/changelog advertises its feed', () => {
  it('declares the feed as an Atom alternate in the head of both changelog pages', () => {
    for (const metadata of [changelogMetadata, releaseNotesMetadata]) {
      expect(metadata.alternates?.types).toEqual({
        'application/atom+xml': [{ url: '/changelog/feed.xml', title: CHANGELOG_FEED_TITLE }],
      });
    }
  });

  it('shows a subscribe link to the feed and lists each subprocessor change with its version', () => {
    render(<ChangelogPage />);

    const subscribe = screen.getByText(/^Subscribe/).closest('a');
    expect(subscribe).toHaveAttribute('href', CHANGELOG_FEED_PATH);
    expect(subscribe).toHaveAttribute('type', 'application/atom+xml');

    const changes = policyChanges().filter((change) => change.history.key === 'subprocessors');
    const links = screen.getAllByText('Subprocessors updated').map((node) => node.closest('a'));
    expect(links.map((link) => link?.getAttribute('href'))).toEqual(
      changes.map((change) => change.href),
    );
    for (const change of changes) {
      expect(screen.getByText(change.summary)).toBeInTheDocument();
    }
  });
});
