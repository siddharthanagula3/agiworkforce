import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import manifest from '@/content/legal/policy-archive/manifest.json';
import { RELEASES, releasePath } from '@/lib/changelog-entries';
import { POLICY_PUBLICATION_FLOOR } from '@/lib/legal/policy-archive';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import ChangelogPage, { metadata as changelogMetadata } from '../page';
import { GET } from '../feed.xml/route';
import { metadata as releaseNotesMetadata } from '../../release-notes/page';
import { metadata as subprocessorsMetadata } from '../../subprocessors/page';
import {
  CHANGELOG_FEED_PATH,
  CHANGELOG_FEED_TITLE,
  renderAtomFeed,
} from '../../release-notes/changelog-feed';

const ATOM = 'http://www.w3.org/2005/Atom';
const RFC_3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORTHCOMING_TARGET = /\bTarget: (.+)\.$/;
const CALENDAR_QUARTER = /^Q[1-4] \d{4}$/;
const QUARTER_CLAIM = /[^.]*\bquarters?\b[^.]*/gi;
const IN_PROGRESS = /\bin progress\b/i;
const IN_PROGRESS_CLAIM = /[^.]*\bin progress\b[^.]*/gi;

const READER_TIME_ZONES = [
  'Pacific/Pago_Pago',
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'UTC',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Noumea',
];

interface RegistryVersion {
  date: string | null;
  summary?: string;
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

const REGISTRY: { documents: Record<string, { versions: RegistryVersion[] }> } = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'docs', 'compliance', 'policy-versions.json'), 'utf8'),
);

const SUBPROCESSOR_REVISIONS = (REGISTRY.documents['subprocessors']?.versions ?? [])
  .filter(
    (version, position, versions) =>
      version.date !== null &&
      versions.findIndex((earlier) => earlier.date === version.date) === position,
  )
  .slice(1)
  .reverse();

const DESCRIBED_VERSIONS = Object.entries(manifest.policies).flatMap(([key, policy]) =>
  policy.versions.flatMap((version, position) => {
    if (!version.summary) return [];
    const older = policy.versions.slice(position + 1);
    const previous = older.find((entry) => entry.published !== false);
    return [
      {
        key,
        slug: policy.slug,
        date: version.date,
        summary: version.summary,
        published: version.published,
        replacedOn: policy.versions[position - 1]?.date ?? null,
        firstPublishedAfter:
          policy.versions
            .slice(0, position)
            .reverse()
            .find((entry) => entry.published !== false)?.date ?? null,
        previouslyPublished: previous?.date ?? null,
        neverPublishedBefore: older
          .slice(0, previous ? older.indexOf(previous) : older.length)
          .map((entry) => entry.date),
        href:
          version.status === 'current'
            ? policy.route
            : version.status === 'archived'
              ? `/legal/archive/${policy.slug}/${version.date}`
              : `/legal/archive/${policy.slug}`,
      },
    ];
  }),
);

const NEVER_PUBLISHED = DESCRIBED_VERSIONS.filter((version) => version.published === false);

const FIRST_PUBLISHED_AFTER_UNPUBLISHED = DESCRIBED_VERSIONS.filter(
  (version) => version.published !== false && version.neverPublishedBefore.length > 0,
);

const REPLACED_BEFORE_PUBLICATION =
  /\breplaced on \S+ before it was published on this site; the first version published here after it is dated \S+\./;

const FIRST_TO_PUBLISH =
  /\bThis version is the first (?:published on this site since the one dated \S+|of this policy published on this site), so it is the first to publish the changes made in the versions? dated /;

const SKIPPED_OBJECTION_WINDOW =
  /\bThe window to object to a subprocessor added in th(?:at version|ose versions) runs from the day this version is first published here\./;

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

function paragraphs(entry: Element): string[] {
  return Array.from(contentHtml(entry).querySelectorAll('p'), (node) => node.textContent ?? '');
}

function calendarDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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

  it('lists every release and every policy version that says what changed, newest first, and is dated by the newest', async () => {
    const feed = await servedFeed();
    const entries = atomChildren(feed, 'entry');
    const updated = entries.map((entry) => text(entry, 'updated'));
    const policies = entries
      .filter((entry) => categoryTerms(entry).includes('policy'))
      .map(
        (entry) =>
          `${text(entry, 'updated')} ${categoryTerms(entry).find((term) => term !== 'policy')}`,
      );

    expect(updated).toHaveLength(RELEASES.length + DESCRIBED_VERSIONS.length);
    expect(policies.sort()).toEqual(
      DESCRIBED_VERSIONS.map((version) => `${version.date}T12:00:00Z ${version.slug}`).sort(),
    );
    expect([...updated].sort().reverse()).toEqual(updated);
    expect(text(feed, 'updated')).toBe(updated[0]);
  });

  it('shows every entry on the day it is dated to readers from UTC-11 to UTC+11', async () => {
    const feed = await servedFeed();

    for (const node of [feed, ...atomChildren(feed, 'entry')]) {
      const updated = text(node, 'updated');
      for (const timeZone of READER_TIME_ZONES) {
        expect(calendarDate(updated, timeZone), `${updated} in ${timeZone}`).toBe(
          updated.slice(0, 10),
        );
      }
    }
  });

  it('opens every policy entry with the date /changelog prints for it, then says what changed', async () => {
    const entries = atomChildren(await servedFeed(), 'entry');

    for (const version of DESCRIBED_VERSIONS) {
      const entry = entries.find(
        (node) =>
          categoryTerms(node).includes(version.slug) &&
          text(node, 'updated').startsWith(version.date),
      );
      const lines = entry ? paragraphs(entry) : [];
      expect(lines[0], `${version.key} ${version.date}`).toMatch(new RegExp(`^${version.date}\\b`));
      expect(lines[1], `${version.key} ${version.date}`).toBe(version.summary);
    }
  });

  it('tells a feed reader that a policy date can precede publication, and when a subprocessor objection window starts', async () => {
    const entries = atomChildren(await servedFeed(), 'entry').filter((entry) =>
      categoryTerms(entry).includes('policy'),
    );
    const floor = `Not published on this site before ${POLICY_PUBLICATION_FLOOR.label}.`;

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const date = text(entry, 'updated').slice(0, 10);
      const lines = paragraphs(entry);
      const where = `${categoryTerms(entry).join(' ')} ${date}`;
      const neverPublished = NEVER_PUBLISHED.some(
        (version) => version.date === date && categoryTerms(entry).includes(version.slug),
      );

      expect(
        lines.some((line) =>
          /date is the day its text was settled, not the day it was published on this site/.test(
            line,
          ),
        ),
        where,
      ).toBe(true);
      expect(lines.includes(floor), where).toBe(
        date < POLICY_PUBLICATION_FLOOR.date && !neverPublished,
      );
      expect(
        lines.some((line) =>
          /window to object to a new subprocessor\b.* runs from the day this change is first published on https?:\/\/\S+\/subprocessors, not from this date\./.test(
            line,
          ),
        ),
        where,
      ).toBe(categoryTerms(entry).includes('subprocessors'));
    }
  });

  it('dates a release that spans months by the first day of the month it ends in', async () => {
    const entries = atomChildren(await servedFeed(), 'entry');
    const span = entries.find((entry) =>
      text(entry, 'id').endsWith(releasePath({ date: '2026-02 to 2026-05' })),
    );

    expect(span).toBeDefined();
    if (span) expect(text(span, 'updated')).toBe('2026-05-01T12:00:00Z');
  });

  it('carries every subprocessor list change the subprocessors page says can be followed', async () => {
    const entries = atomChildren(await servedFeed(), 'entry').filter((entry) =>
      categoryTerms(entry).includes('subprocessors'),
    );

    expect(SUBPROCESSOR_REVISIONS.length).toBeGreaterThan(1);
    expect(entries.map((entry) => text(entry, 'updated'))).toEqual(
      SUBPROCESSOR_REVISIONS.map((revision) => `${revision.date}T12:00:00Z`),
    );
    entries.forEach((entry, index) => {
      expect(categoryTerms(entry)).toContain('policy');
      expect(paragraphs(entry)[1]).toBe(SUBPROCESSOR_REVISIONS[index]?.summary);
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
  it('declares the feed as an Atom alternate in the head of both changelog pages and the subprocessor list', () => {
    for (const metadata of [changelogMetadata, releaseNotesMetadata, subprocessorsMetadata]) {
      expect(metadata.alternates?.types).toEqual({
        'application/atom+xml': [{ url: '/changelog/feed.xml', title: CHANGELOG_FEED_TITLE }],
      });
    }
    expect(subprocessorsMetadata.alternates?.canonical).toMatch(/\/subprocessors$/);
  });

  it('shows a subscribe link to the feed', () => {
    render(<ChangelogPage />);

    const subscribe = screen.getByText(/^Subscribe/).closest('a');
    expect(subscribe).toHaveAttribute('href', CHANGELOG_FEED_PATH);
    expect(subscribe).toHaveAttribute('type', 'application/atom+xml');
  });
});

describe('/changelog lists policy changes', () => {
  function policyRows() {
    render(<ChangelogPage />);
    return within(screen.getByRole('list', { name: 'Policy changes' }))
      .getAllByRole('listitem')
      .map((row) => {
        const link = within(row).getByRole('link');
        return {
          date: row.firstElementChild?.textContent ?? '',
          name: link.textContent ?? '',
          href: link.getAttribute('href') ?? '',
          text: row.textContent ?? '',
        };
      });
  }

  it('lists every policy version that says what changed, newest first, linked to that version', () => {
    const rows = policyRows();
    const dates = rows.map((row) => row.date);

    expect(rows.map((row) => `${row.date} ${row.href}`).sort()).toEqual(
      DESCRIBED_VERSIONS.map((version) => `${version.date} ${version.href}`).sort(),
    );
    expect(dates).toEqual([...dates].sort().reverse());
    for (const version of DESCRIBED_VERSIONS) {
      const row = rows.find((entry) => entry.date === version.date && entry.href === version.href);
      expect(row?.text, `${version.key} ${version.date}`).toContain(version.summary);
    }
  });

  it('lists each change to the subprocessor list on the date the list changed', () => {
    const rows = policyRows().filter((row) => row.name === 'Subprocessors updated');

    expect(rows.map((row) => row.date)).toEqual(
      SUBPROCESSOR_REVISIONS.map((revision) => revision.date),
    );
    rows.forEach((row, index) => {
      expect(row.text).toContain(SUBPROCESSOR_REVISIONS[index]?.summary);
    });
  });

  it('names a policy first published after version histories began as introduced, on the page and in the feed', async () => {
    const introduced = Object.values(manifest.policies).flatMap((policy) => {
      const first = policy.versions.at(-1);
      return first?.summary && first.date > manifest.recordedSince
        ? [{ route: policy.route, slug: policy.slug, date: first.date }]
        : [];
    });
    const rows = policyRows();
    const entries = atomChildren(await servedFeed(), 'entry');

    expect(introduced.map((policy) => policy.route)).toContain('/referral-terms');
    for (const policy of introduced) {
      const row = rows.find((entry) => entry.date === policy.date && entry.href === policy.route);
      const entry = entries.find(
        (node) =>
          categoryTerms(node).includes(policy.slug) &&
          text(node, 'updated').startsWith(policy.date),
      );
      expect(row?.name, policy.route).toMatch(/ introduced$/);
      expect(entry && text(entry, 'title'), policy.route).toBe(row?.name);
    }
    expect(rows.filter((row) => row.name.endsWith(' introduced'))).toHaveLength(introduced.length);
  });

  it('says on the page and in the feed that a listed version this site never published was replaced before it was published, and names the first version published after it', async () => {
    const rows = policyRows();
    const entries = atomChildren(await servedFeed(), 'entry');
    const floor = `Not published on this site before ${POLICY_PUBLICATION_FLOOR.label}.`;

    expect(
      NEVER_PUBLISHED.map(
        (version) => `${version.key} ${version.date} ${version.firstPublishedAfter}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'subprocessors 2026-09-21 2026-09-28',
        'subprocessors 2026-09-22 2026-09-28',
        'terms 2026-09-22 2026-09-23',
      ]),
    );
    for (const version of NEVER_PUBLISHED) {
      const where = `${version.key} ${version.date}`;
      const standing = `This version was settled on ${version.date} and replaced on ${version.replacedOn} before it was published on this site; the first version published here after it is dated ${version.firstPublishedAfter}.`;
      const row = rows.find((entry) => entry.date === version.date && entry.href === version.href);
      const entry = entries.find(
        (node) =>
          categoryTerms(node).includes(version.slug) &&
          text(node, 'updated').startsWith(version.date),
      );
      const lines = entry ? paragraphs(entry) : [];

      expect(row?.text, where).toContain(standing);
      expect(lines, where).toContain(standing);
      expect(lines, where).not.toContain(floor);
    }
    expect(rows.filter((row) => REPLACED_BEFORE_PUBLICATION.test(row.text))).toHaveLength(
      NEVER_PUBLISHED.length,
    );
    expect(
      entries.filter((entry) =>
        paragraphs(entry).some((line) => REPLACED_BEFORE_PUBLICATION.test(line)),
      ),
    ).toHaveLength(NEVER_PUBLISHED.length);
  });

  it('says on the page and in the feed that the first version published after versions this site never published is the first to publish their changes, and when their objection window starts', async () => {
    const rows = policyRows();
    const entries = atomChildren(await servedFeed(), 'entry');

    expect(
      FIRST_PUBLISHED_AFTER_UNPUBLISHED.map(
        (version) => `${version.key} ${version.date} ${version.neverPublishedBefore.join(' ')}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'subprocessors 2026-09-28 2026-09-22 2026-09-21',
        'terms 2026-09-23 2026-09-22',
        'privacy 2026-09-29 2026-09-27 2026-09-22 2026-09-21',
      ]),
    );
    for (const version of FIRST_PUBLISHED_AFTER_UNPUBLISHED) {
      const where = `${version.key} ${version.date}`;
      const row = rows.find((entry) => entry.date === version.date && entry.href === version.href);
      const entry = entries.find(
        (node) =>
          categoryTerms(node).includes(version.slug) &&
          text(node, 'updated').startsWith(version.date),
      );
      const standing =
        (entry ? paragraphs(entry) : []).find((line) => FIRST_TO_PUBLISH.test(line)) ?? '';

      expect(standing, where).toContain(
        version.previouslyPublished
          ? `the first published on this site since the one dated ${version.previouslyPublished},`
          : 'the first of this policy published on this site,',
      );
      for (const date of version.neverPublishedBefore) {
        expect(standing, `${where} ${date}`).toContain(date);
      }
      expect(SKIPPED_OBJECTION_WINDOW.test(standing), where).toBe(version.key === 'subprocessors');
      expect(row?.text, where).toContain(standing);
    }
    expect(rows.filter((row) => FIRST_TO_PUBLISH.test(row.text))).toHaveLength(
      FIRST_PUBLISHED_AFTER_UNPUBLISHED.length,
    );
    expect(
      entries.filter((entry) => paragraphs(entry).some((line) => FIRST_TO_PUBLISH.test(line))),
    ).toHaveLength(FIRST_PUBLISHED_AFTER_UNPUBLISHED.length);
  });

  it('names each change link by its policy and date, so no two links share a name', () => {
    const rows = policyRows();
    const list = within(screen.getByRole('list', { name: 'Policy changes' }));

    for (const row of rows) {
      expect(list.getByRole('link', { name: `${row.name} ${row.date}` })).toHaveAttribute(
        'href',
        row.href,
      );
    }
  });

  it('says where the list begins and lists the revisions of that day it names', () => {
    const rows = policyRows();
    const section = screen.getByRole('region', { name: 'Policy changes, newest first.' });
    const prose = section.querySelector('p')?.textContent ?? '';

    expect(prose).toContain('on 21 September 2026');
    expect(prose).not.toMatch(/each time a policy is revised/i);
    for (const named of [
      'the privacy policy',
      'the mobile app’s terms and privacy policy',
      'the subprocessor list',
      'the trust posture',
    ]) {
      expect(prose, named).toContain(named);
    }
    expect(
      rows
        .filter((row) => row.date === '2026-09-21')
        .map((row) => row.name)
        .sort(),
    ).toEqual([
      'Mobile app terms and privacy updated',
      'Privacy policy updated',
      'Subprocessors updated',
      'Trust posture updated',
    ]);
  });

  it('does not claim its dates are never earlier than publication, or that it never pre-announces while it lists forthcoming items', () => {
    render(<ChangelogPage />);
    const copy = document.body.textContent ?? '';
    const forthcoming = within(screen.getByRole('list', { name: 'Forthcoming' })).queryAllByRole(
      'listitem',
    );

    expect(copy).not.toMatch(/backdate/i);
    expect(forthcoming).not.toHaveLength(0);
    expect(copy).not.toMatch(/pre-?announce/i);
  });

  it('speaks of a target quarter only when every forthcoming row shows one', () => {
    render(<ChangelogPage />);
    const rows = within(screen.getByRole('list', { name: 'Forthcoming' })).getAllByRole('listitem');
    const targets = rows.flatMap(
      (row) => FORTHCOMING_TARGET.exec(row.textContent ?? '')?.slice(1, 2) ?? [],
    );

    expect(targets).toHaveLength(rows.length);
    if (!targets.every((target) => CALENDAR_QUARTER.test(target))) {
      expect(document.body.textContent?.match(QUARTER_CLAIM) ?? []).toEqual([]);
    }
  });

  it('makes no promise to list only what is actively maintained while it lists releases of the retired Tauri build', () => {
    render(<ChangelogPage />);
    const releases = within(screen.getByRole('list', { name: 'Releases' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');

    expect(releases.some((row) => /\bTauri\b/.test(row))).toBe(true);
    expect(document.body.textContent).not.toMatch(/\bactively maintain/i);
  });

  it("promises no 'in progress' items while no row shows that state", () => {
    render(<ChangelogPage />);
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '');

    if (!rows.some((row) => IN_PROGRESS.test(row))) {
      expect(document.body.textContent?.match(IN_PROGRESS_CLAIM) ?? []).toEqual([]);
    }
  });

  it('says a policy date can precede publication, when the listed versions were first published, and when the objection window starts', () => {
    render(<ChangelogPage />);
    const section = screen.getByRole('region', { name: 'Policy changes, newest first.' });
    const prose = section.textContent ?? '';
    const { label } = POLICY_PUBLICATION_FLOOR;

    expect(prose).toMatch(
      /date is the day its text was settled, not the day it was published on this site/,
    );
    expect(prose).toContain(
      `no version listed here with a date before ${label} had been published on this site before that day.`,
    );
    expect(prose).toMatch(
      /window to object to a new subprocessor, set in section 05 of our data processing addendum, runs from the day the change is first published on \/subprocessors, not from the date listed here\./,
    );
    expect(
      within(section).getByRole('link', { name: 'section 05 of our data processing addendum' }),
    ).toHaveAttribute('href', '/dpa#s-05');
    expect(within(section).getByRole('link', { name: '/subprocessors' })).toHaveAttribute(
      'href',
      '/subprocessors',
    );
  });
});
