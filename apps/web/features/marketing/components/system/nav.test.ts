import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRODUCT_NAMES } from '@agiworkforce/types';
import { RELEASE_NOTES_METADATA } from '@/app/release-notes/release-notes-metadata';
import { USE_CASE_SLUGS } from '@/features/marketing/components/pages/business/use-cases-content';
import { SITE_URL } from '@/lib/seo/site';
import { SURFACE_STATUS } from '@/lib/surface-status';

import { FOOTER_COLUMNS, NAV_GROUPS } from './nav';

const FOOTER_HREFS_BEFORE_REGROUP = [
  '/about',
  '/blog',
  '/byok',
  '/careers',
  '/changelog',
  '/chrome-extension',
  '/cli',
  '/contact',
  '/desktop',
  '/docs',
  '/download',
  '/enterprise',
  '/faq',
  '/features/agents',
  '/features/artifacts',
  '/features/deep-research',
  '/features/memory',
  '/features/projects',
  '/help',
  '/local',
  '/mobile',
  '/pricing',
  '/providers',
  '/skills',
  '/status',
  '/support',
  '/teams',
  '/vscode-extension',
  '/web',
];
const FOOTER_HREFS_ADDED_SINCE_REGROUP = [
  '/agi-code',
  '/agi-work',
  '/customers',
  '/partners',
  '/press',
];
const FOOTER_HREFS_MOVED_TO_THEIR_CANONICAL_ADDRESS: Readonly<Record<string, string>> = {
  '/changelog': '/release-notes',
};
const MAX_LINKS_PER_COLUMN = 7;
const PRODUCT_PAGES = ['/agi-work', '/agi-code'];
const FEATURES_INDEX = '/features';
const APP_DIR = resolve(__dirname, '../../../../app');
const FEATURES_DIR = resolve(APP_DIR, 'features');
const BLOG_INDEX = '/blog';
const BLOG_POST_ROUTE = resolve(APP_DIR, 'blog/[slug]');
const RELEASE_ARCHIVE_ALIAS = '/changelog';
const RELEASE_ARCHIVE_LABEL = 'Release notes';
const RELEASE_ARCHIVE = String(RELEASE_NOTES_METADATA.alternates?.canonical).replace(SITE_URL, '');
const USE_CASES_INDEX = '/use-cases';
const CLAIMS_THE_PRODUCT_CANNOT_BACK = [
  /every shipped feature/i,
  /attach in one step/i,
  /connect the tools you already use/i,
  /teams run on agi/i,
  /source behind every claim/i,
  /approval as the default/i,
  /every provider the catalogue compiles in/i,
];

const footerHrefs = () =>
  FOOTER_COLUMNS.flatMap((column) => column.links.map((link) => link.href as string));

const headerGroup = (label: string) => NAV_GROUPS.find((group) => group.label === label);

const headerItems = () => NAV_GROUPS.flatMap((group) => group.items);

const headerHrefs = () => headerItems().map((item) => item.href);

const headerDescription = (href: string) =>
  headerItems().find((item) => item.href === href)?.description ?? '';

const footerLinks = () =>
  FOOTER_COLUMNS.flatMap((column) =>
    column.links.map((link) => ({ href: link.href as string, label: link.label as string })),
  );

const featureDetailRoutes = () =>
  readdirSync(FEATURES_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(resolve(FEATURES_DIR, entry.name, 'page.tsx')),
    )
    .map((entry) => `${FEATURES_INDEX}/${entry.name}`)
    .sort();

describe('nav, footer discoverability', () => {
  it('links the FAQ from the footer so it is reachable site-wide', () => {
    const hasFaqLink = FOOTER_COLUMNS.some((column) =>
      column.links.some((link) => link.href === '/faq'),
    );
    expect(hasFaqLink).toBe(true);
  });

  it('keeps every destination the footer linked before the columns were regrouped', () => {
    expect([...new Set(footerHrefs())].sort()).toEqual(
      [
        ...FOOTER_HREFS_BEFORE_REGROUP.map(
          (href) => FOOTER_HREFS_MOVED_TO_THEIR_CANONICAL_ADDRESS[href] ?? href,
        ),
        ...FOOTER_HREFS_ADDED_SINCE_REGROUP,
      ].sort(),
    );
  });

  it('caps every column so the five read as one balanced block', () => {
    for (const column of FOOTER_COLUMNS) {
      expect(column.links.length, column.title).toBeLessThanOrEqual(MAX_LINKS_PER_COLUMN);
    }
  });

  it('never links the same destination twice within one column', () => {
    for (const column of FOOTER_COLUMNS) {
      const hrefs = column.links.map((link) => link.href);
      expect(new Set(hrefs).size, column.title).toBe(hrefs.length);
    }
  });

  it('reaches AGI Work and AGI Code from the header and the footer', () => {
    const product = headerGroup('Products')?.items.map((item) => item.href) ?? [];
    for (const href of PRODUCT_PAGES) {
      expect(product, href).toContain(href);
      expect(footerHrefs(), href).toContain(href);
    }
  });

  it('carries only a destination and its name, since the footer shows no release state', () => {
    for (const link of FOOTER_COLUMNS.flatMap((column) => [...column.links])) {
      expect(Object.keys(link).sort(), link.href).toEqual(['href', 'label']);
    }
  });
});

describe('nav, the release archive', () => {
  it('is linked at the address its pages declare canonical, under that page name', () => {
    expect(RELEASE_ARCHIVE).toBe('/release-notes');
    expect(headerItems().filter((item) => item.href === RELEASE_ARCHIVE)).toEqual([
      expect.objectContaining({ label: RELEASE_ARCHIVE_LABEL }),
    ]);
    expect(footerLinks().filter((link) => link.href === RELEASE_ARCHIVE)).toEqual([
      { href: RELEASE_ARCHIVE, label: RELEASE_ARCHIVE_LABEL },
    ]);
  });

  it('is never linked at its second address or under its old name', () => {
    const links = [...headerItems(), ...footerLinks()];
    expect(links.filter((link) => link.href.startsWith(RELEASE_ARCHIVE_ALIAS))).toEqual([]);
    expect(links.filter((link) => /changelog/i.test(link.label))).toEqual([]);
  });

  it('is where the home page sends a reader for every release', () => {
    const home = readFileSync(resolve(__dirname, '../MarketingLanding.tsx'), 'utf8');
    expect(home).toContain(`more={{ href: '${RELEASE_ARCHIVE}', label: 'All release notes' }}`);
    expect(home).not.toContain(`'${RELEASE_ARCHIVE_ALIAS}'`);
  });

  it.each([
    'app/about/page.tsx',
    'app/status/page.tsx',
    'features/settings/sections/HelpSection.tsx',
  ])('is linked from %s at the canonical address only', (file) => {
    const source = readFileSync(resolve(APP_DIR, '..', file), 'utf8');
    expect(source).toMatch(new RegExp(`['"]${RELEASE_ARCHIVE}['"]`));
    expect(source).not.toMatch(new RegExp(`['"]${RELEASE_ARCHIVE_ALIAS}['"]`));
    expect(source).not.toMatch(/\bchangelog\s*<|['"](?:Full|Read the) changelog/i);
  });
});

describe('nav, header groups', () => {
  it('offers exactly the Products, Solutions and Resources menus, in that order', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(['Products', 'Solutions', 'Resources']);
  });

  it('reaches the features index from the header and every feature page from that index', () => {
    expect(headerHrefs()).toContain(FEATURES_INDEX);
    const index = readFileSync(resolve(FEATURES_DIR, 'page.tsx'), 'utf8');
    const routes = featureDetailRoutes();
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(index, route).toContain(`'${route}'`);
    }
  });

  it('lists every product name from the registry in the Products menu', () => {
    const labels = headerGroup('Products')?.items.map((item) => item.label) ?? [];
    for (const name of [
      PRODUCT_NAMES.chat,
      PRODUCT_NAMES.desktop,
      PRODUCT_NAMES.cli,
      PRODUCT_NAMES.extension,
      PRODUCT_NAMES.mobile,
      PRODUCT_NAMES.work,
      PRODUCT_NAMES.code,
    ]) {
      expect(labels, name).toContain(name);
    }
  });

  it('never repeats a destination across the three menus', () => {
    const hrefs = headerHrefs();
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('never links the same destination twice within one group', () => {
    for (const group of NAV_GROUPS) {
      const hrefs = group.items.map((item) => item.href);
      expect(new Set(hrefs).size, group.label).toBe(hrefs.length);
    }
  });

  it('links the blog index and no post beneath it', () => {
    const blogLinks = [...headerHrefs(), ...footerHrefs()].filter((href) =>
      href.startsWith(BLOG_INDEX),
    );
    expect(blogLinks.length).toBeGreaterThan(0);
    expect(new Set(blogLinks)).toEqual(new Set([BLOG_INDEX]));
  });
});

describe('nav, header descriptions', () => {
  it('makes no claim the release archive, the connector switch or the customer page contradicts', () => {
    for (const claim of CLAIMS_THE_PRODUCT_CANNOT_BACK) {
      const offending = headerItems().filter((item) => claim.test(item.description ?? ''));
      expect(
        offending.map((item) => item.href),
        String(claim),
      ).toEqual([]);
    }
  });

  it('describes the release notes as the dated archive the page calls itself', () => {
    expect(headerDescription(RELEASE_ARCHIVE)).toBe('What shipped, and when');
  });

  it('says the blog has no posts for as long as no post page exists', () => {
    expect(existsSync(BLOG_POST_ROUTE)).toBe(false);
    expect(headerDescription(BLOG_INDEX)).toBe(
      'No posts yet; announcements are in the release notes',
    );
  });

  it('describes careers as the careers page does, and neither claims a team the founder page denies', () => {
    const careers = readFileSync(resolve(APP_DIR, 'careers/page.tsx'), 'utf8');
    const founder = readFileSync(resolve(APP_DIR, 'founder/page.tsx'), 'utf8');
    const description = headerDescription('/careers');

    expect(founder).toContain('built and led by one person');
    expect(careers).toContain(`title="${description}."`);
    expect(description).not.toMatch(/\bteam\b/i);
    expect(careers).not.toMatch(/\bteam\b/i);
  });

  it('describes integrations and the MCP directory by what their pages cover', () => {
    expect(headerDescription('/integrations')).toBe(
      'MCP plugins, the browser bridge and provider keys',
    );
    expect(headerDescription('/connectors/mcp-directory')).toBe(
      'Remote MCP servers, with publisher and tools',
    );
  });

  it('says where the Local and provider-key routes run, with the state the registry gives the CLI', () => {
    for (const href of ['/local', '/byok']) {
      const description = headerDescription(href);
      expect(description, href).toContain(`in the CLI, ${SURFACE_STATUS.cli.toLowerCase()}`);
      expect(description, href).not.toMatch(/works offline|no markup/i);
    }
  });

  it('describes providers as their own page does', () => {
    const providers = readFileSync(resolve(APP_DIR, 'providers/page.tsx'), 'utf8');

    expect(providers.replace(/\s+/g, ' ')).toContain('that the CLI takes a key for');
    expect(headerDescription('/providers')).toBe('The providers the CLI takes your key for');
  });

  it('names every use case page in the Use cases description', () => {
    const description = headerDescription(USE_CASES_INDEX).toLowerCase();
    expect(USE_CASE_SLUGS.length).toBeGreaterThan(0);
    for (const slug of USE_CASE_SLUGS) {
      expect(description, slug).toContain(slug.replace(/-/g, ' '));
    }
  });
});
