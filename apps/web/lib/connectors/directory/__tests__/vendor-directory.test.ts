import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/directory/connectable', () => ({
  connectableForInternalId: () => 'connect',
  connectableFromAuthMode: (authMode: string, hasRemote: boolean) =>
    !hasRemote ? 'desktop-and-cli' : authMode === 'unknown' ? 'needs-setup' : 'connect',
}));

import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import {
  hostnameOf,
  isCodeForgeHost,
  isHostingPlatformHost,
} from '@/lib/connectors/directory/hosts';
import { MAX_DESCRIPTION_LENGTH } from '@/lib/connectors/directory/summary';
import {
  VENDOR_DIRECTORY_ENTRIES,
  applyVendorDirectory,
  buildVendorRecord,
  listingNoteFor,
  planVendorDirectory,
  type VendorDirectoryEntry,
} from '@/lib/connectors/directory/vendor-directory';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const EM_DASH = String.fromCodePoint(0x2014);
const ASSISTANT_BRAND = /\bClaude\b/u;
const SENTENCE_END = /[.!?…)]$/u;
const VALID_CATEGORIES: ReadonlySet<string> = new Set(DIRECTORY_CATEGORIES);

function entry(id: string): VendorDirectoryEntry {
  const found = VENDOR_DIRECTORY_ENTRIES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing vendor entry ${id}`);
  return found;
}

function record(
  overrides: Partial<DirectoryRecord> & Pick<DirectoryRecord, 'id'>,
): DirectoryRecord {
  return {
    name: overrides.id,
    publisher: 'someone',
    description: `${overrides.id} description.`,
    categories: ['Other'],
    remotes: [],
    authMode: 'unknown',
    connectable: 'needs-setup',
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: 'X',
    monogramHue: 'other',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

describe('vendor-directory.json', () => {
  it('has unique ids, the source marker and the external directory id on every entry', () => {
    const ids = VENDOR_DIRECTORY_ENTRIES.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    const externalIds = VENDOR_DIRECTORY_ENTRIES.map((candidate) => candidate.externalDirectoryId);
    expect(externalIds.every((value) => value === null || typeof value === 'string')).toBe(true);
    expect(externalIds.filter((value) => value !== null).length).toBeGreaterThan(0);
    expect(
      VENDOR_DIRECTORY_ENTRIES.every((candidate) => candidate.source === 'vendor-directory'),
    ).toBe(true);
  });

  it('keeps every summary to one bounded sentence without dashes or the assistant brand', () => {
    for (const candidate of VENDOR_DIRECTORY_ENTRIES) {
      expect(candidate.summary.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(SENTENCE_END.test(candidate.summary)).toBe(true);
      expect(candidate.summary).not.toContain(EM_DASH);
      expect(candidate.description).not.toContain(EM_DASH);
      expect(ASSISTANT_BRAND.test(`${candidate.summary} ${candidate.description}`)).toBe(false);
    }
  });

  it('maps every category onto the eleven directory categories', () => {
    for (const candidate of VENDOR_DIRECTORY_ENTRIES) {
      expect(candidate.categories.length).toBeGreaterThan(0);
      expect(candidate.categories.every((category) => VALID_CATEGORIES.has(category))).toBe(true);
    }
  });

  it('pairs a transport with every https endpoint and never invents one', () => {
    for (const candidate of VENDOR_DIRECTORY_ENTRIES) {
      if (candidate.mcpUrl) {
        expect(new URL(candidate.mcpUrl).protocol).toBe('https:');
        expect(candidate.transport).not.toBeNull();
      } else {
        expect(candidate.transport).toBeNull();
      }
    }
  });
});

describe('planVendorDirectory', () => {
  const notion = entry('notion');
  const cloudflare = entry('cloudflare');

  it('claims the registry record that serves the same endpoint and overrides its card fields', () => {
    const mirror = record({
      id: 'io.github.someone/notion-mirror',
      remotes: [{ url: 'https://mcp.notion.com/mcp/', transport: 'streamable-http' }],
    });
    const plan = planVendorDirectory([mirror], [notion]);

    expect(plan.matches.map((match) => [match.record.id, match.kind])).toEqual([
      ['io.github.someone/notion-mirror', 'url'],
    ]);
    expect(plan.created).toEqual([]);
    const [applied] = applyVendorDirectory([mirror], [notion]);
    expect(applied).toMatchObject({
      id: 'io.github.someone/notion-mirror',
      name: 'Notion',
      publisher: 'Notion',
      description: notion.summary,
      categories: notion.categories,
      badge: 'official',
      documentationUrl: notion.documentationUrl,
      privacyPolicyUrl: notion.privacyPolicyUrl,
      supportUrl: notion.supportUrl,
      websiteUrl: notion.websiteUrl,
      iconSource: 'brand',
      brandSlug: 'notion',
      featured: true,
    });
  });

  it('lets a first-party seed keep its own card and only fills missing links', () => {
    const seed = record({
      id: 'notion',
      name: 'Notion',
      description: 'Search, create, and update notes and pages in your Notion workspace.',
      categories: ['Productivity'],
      sourceRegistry: 'internal',
      badge: 'first-party',
      remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
      documentationUrl: 'https://developers.notion.com/guides/mcp/mcp-supported-tools',
    });
    const [applied] = applyVendorDirectory([seed], [notion]);

    expect(applied).toMatchObject({
      description: 'Search, create, and update notes and pages in your Notion workspace.',
      categories: ['Productivity'],
      badge: 'first-party',
      documentationUrl: 'https://developers.notion.com/guides/mcp/mcp-supported-tools',
      privacyPolicyUrl: notion.privacyPolicyUrl,
      featured: true,
    });
  });

  it('matches a catalog record by id when the endpoint differs and fills an empty remote list', () => {
    const catalog = record({
      id: 'notion',
      sourceRegistry: 'internal',
      badge: 'first-party',
      remotes: [],
    });
    const plan = planVendorDirectory([catalog], [notion]);
    expect(plan.matches[0]?.kind).toBe('id');
  });

  it('matches by vendor domain and prefers the official record with the shortest remote', () => {
    const docs = record({
      id: 'com.cloudflare/docs',
      badge: 'official',
      remotes: [{ url: 'https://docs.mcp.cloudflare.com/mcp', transport: 'streamable-http' }],
    });
    const bindings = record({
      id: 'com.cloudflare/bindings',
      badge: 'official',
      remotes: [{ url: 'https://bindings.mcp.cloudflare.com/mcp', transport: 'streamable-http' }],
    });
    const community = record({
      id: 'io.github.someone/cf',
      remotes: [{ url: 'https://x.mcp.cloudflare.com/mcp', transport: 'streamable-http' }],
    });
    const plan = planVendorDirectory(
      [community, bindings, docs],
      [{ ...cloudflare, mcpUrl: null, transport: null }],
    );

    expect(plan.matches.map((match) => [match.record.id, match.kind])).toEqual([
      ['com.cloudflare/docs', 'domain'],
    ]);
  });

  it('requires a shared product name for a domain match', () => {
    const learn = record({
      id: 'com.microsoft/microsoft-learn-mcp',
      name: 'Microsoft Learn',
      badge: 'official',
      remotes: [{ url: 'https://learn.microsoft.com/api/mcp', transport: 'streamable-http' }],
    });
    const dataverse: VendorDirectoryEntry = {
      ...notion,
      id: 'dataverse',
      name: 'Microsoft Dataverse',
      mcpUrl: null,
      transport: null,
      websiteUrl: 'https://www.microsoft.com/',
      publisher: { name: 'Microsoft', url: 'https://www.microsoft.com/' },
    };
    expect(planVendorDirectory([learn], [dataverse]).matches).toEqual([]);

    const guru = record({
      id: 'com.getguru/mcp-server',
      name: 'Guru',
      remotes: [{ url: 'https://mcp.getguru.com/mcp', transport: 'streamable-http' }],
    });
    const guruEntry: VendorDirectoryEntry = {
      ...dataverse,
      id: 'guru',
      name: 'Guru',
      websiteUrl: 'https://www.getguru.com/',
      publisher: { name: 'Guru', url: 'https://www.getguru.com/' },
    };
    expect(planVendorDirectory([guru], [guruEntry]).matches[0]?.kind).toBe('domain');
  });

  it('never matches through a hosting platform website and never claims a record twice', () => {
    const hosted = record({
      id: 'io.github.someone/hosted',
      remotes: [{ url: 'https://acme.workers.dev/mcp', transport: 'streamable-http' }],
    });
    const acme: VendorDirectoryEntry = {
      ...notion,
      id: 'acme',
      name: 'Acme',
      mcpUrl: null,
      transport: null,
      websiteUrl: 'https://acme.workers.dev',
      publisher: { name: 'Acme', url: 'https://acme.workers.dev' },
    };
    const plan = planVendorDirectory([hosted], [acme, acme]);

    expect(plan.matches).toEqual([]);
    expect(plan.created.map((candidate) => candidate.id)).toEqual(['acme']);
    expect(plan.withoutEndpoint.map((candidate) => candidate.id)).toEqual(['acme']);
    expect(plan.skipped.map((candidate) => candidate.id)).toEqual(['acme']);
  });

  it('creates an official record for an unmatched vendor with an endpoint', () => {
    const plan = planVendorDirectory([], [notion]);
    const [created] = plan.created;

    expect(created).toMatchObject({
      id: 'notion',
      name: 'Notion',
      publisher: 'Notion',
      remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
      authMode: 'unknown',
      connectable: 'needs-setup',
      sourceRegistry: 'internal',
      badge: 'official',
      iconSource: 'brand',
      brandSlug: 'notion',
      featured: true,
      authorUrl: 'https://notion.com/',
    });
  });

  it('lists a vendor without an endpoint as a listed record instead of inventing a url', () => {
    const genomics = entry('10x-genomics-cloud');
    const plan = planVendorDirectory([], [genomics]);

    expect(plan.withoutEndpoint).toEqual([genomics]);
    expect(plan.created[0]).toMatchObject({
      id: '10x-genomics-cloud',
      name: '10x Genomics Cloud',
      remotes: [],
      authMode: 'unknown',
      connectable: 'needs-setup',
      badge: 'official',
      featured: true,
      sourceRegistry: 'internal',
      websiteUrl: genomics.websiteUrl,
      documentationUrl: genomics.documentationUrl,
      privacyPolicyUrl: genomics.privacyPolicyUrl,
      supportUrl: genomics.supportUrl,
      iconSource: 'site',
      listingNote:
        "10x Genomics lists this connector without a public endpoint; connect it from the vendor's own app or ask them for an MCP URL.",
    });
    expect(listingNoteFor(genomics)).not.toContain(EM_DASH);
    expect(buildVendorRecord(entry('notion')).listingNote).toBeUndefined();
  });

  it('takes the site favicon path from the publisher website when there is no brand mark', () => {
    const bitly = entry('bitly');
    expect(buildVendorRecord(bitly)).toMatchObject({
      iconSource: 'brand',
      brandSlug: 'bitly',
    });
    const websiteOnly: VendorDirectoryEntry = {
      ...bitly,
      id: 'zzz-links',
      name: 'Zzz Links',
      mcpUrl: 'https://mcp.zzz-links.example/mcp',
      websiteUrl: 'https://zzz-links.example',
      publisher: { name: 'Zzz Links', url: 'https://zzz-links.example' },
    };
    expect(buildVendorRecord(websiteOnly)).toMatchObject({
      iconSource: 'site',
      brandSlug: null,
      websiteUrl: 'https://zzz-links.example',
    });

    const plain = record({
      id: 'com.zzz-links/mcp',
      remotes: [{ url: 'https://mcp.zzz-links.example/mcp', transport: 'streamable-http' }],
    });
    const [matched] = applyVendorDirectory([plain], [websiteOnly]);
    expect(matched).toMatchObject({
      iconSource: 'site',
      websiteUrl: 'https://zzz-links.example',
      featured: true,
    });
  });

  it('uses the remote origin as the site when the vendor has no website', () => {
    const noSite: VendorDirectoryEntry = {
      ...entry('notion'),
      id: 'zzz-remote',
      name: 'Zzz Remote',
      mcpUrl: 'https://mcp.zzz-remote.example/mcp',
      websiteUrl: null,
      publisher: { name: 'Zzz Remote', url: null },
    };
    expect(buildVendorRecord(noSite)).toMatchObject({
      iconSource: 'site',
      websiteUrl: 'https://mcp.zzz-remote.example',
    });
  });

  it('falls back to a monogram when neither a brand mark nor a site exists', () => {
    const unknownVendor: VendorDirectoryEntry = {
      ...notion,
      id: 'zzz-vendor',
      name: 'Zzz Vendor',
      mcpUrl: 'https://mcp.zzz-vendor.example/mcp',
      websiteUrl: 'https://zzz-vendor.example',
      publisher: { name: 'Zzz Vendor', url: 'https://zzz-vendor.example' },
    };
    expect(buildVendorRecord(unknownVendor).iconSource).toBe('site');
    expect(
      buildVendorRecord({
        ...unknownVendor,
        mcpUrl: null,
        transport: null,
        websiteUrl: null,
        publisher: { name: 'Zzz', url: null },
      }).iconSource,
    ).toBe('monogram');
  });
});

describe('buildVendorRecord over the whole scrape', () => {
  const built = VENDOR_DIRECTORY_ENTRIES.map(
    (candidate) => [candidate, buildVendorRecord(candidate)] as const,
  );

  function siteIconHost(record: DirectoryRecord): string | null {
    return record.websiteUrl ? hostnameOf(record.websiteUrl) : null;
  }

  function hasFaviconSite(record: DirectoryRecord): boolean {
    const host = siteIconHost(record);
    return host !== null && !isCodeForgeHost(host) && !isHostingPlatformHost(host);
  }

  it('lists every entry without an endpoint and connects every entry with one', () => {
    for (const [candidate, record] of built) {
      expect(record).toMatchObject({
        id: candidate.id,
        name: candidate.name,
        publisher: candidate.publisher.name,
        description: candidate.summary,
        categories: candidate.categories,
        authMode: 'unknown',
        badge: 'official',
        sourceRegistry: 'internal',
        featured: true,
        documentationUrl: candidate.documentationUrl,
        privacyPolicyUrl: candidate.privacyPolicyUrl,
        supportUrl: candidate.supportUrl,
      });
      if (candidate.mcpUrl) {
        expect(record.remotes).toEqual([{ url: candidate.mcpUrl, transport: candidate.transport }]);
        expect(record.listingNote).toBeUndefined();
      } else {
        expect(record.remotes).toEqual([]);
        expect(record.connectable).toBe('needs-setup');
        expect(record.listingNote).toBe(listingNoteFor(candidate));
        expect(record.listingNote?.startsWith(candidate.publisher.name)).toBe(true);
        expect(record.listingNote).not.toContain(EM_DASH);
      }
    }
    expect(built.some(([candidate]) => candidate.mcpUrl === null)).toBe(true);
    expect(built.some(([candidate]) => candidate.mcpUrl !== null)).toBe(true);
  });

  it('gives every record a brand mark or a site favicon and reserves the monogram for forge-hosted sites', () => {
    for (const [, record] of built) {
      if (record.brandSlug) {
        expect(record.iconSource).toBe('brand');
      } else if (hasFaviconSite(record)) {
        expect(record.iconSource).toBe('site');
      } else {
        expect(record.iconSource).toBe('monogram');
      }
      if (record.iconSource === 'site') expect(record.websiteUrl).not.toBeNull();
    }
    expect(built.some(([, record]) => record.iconSource === 'site')).toBe(true);
  });
});
