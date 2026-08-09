import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/use-cases/layout';

/**
 * `/use-cases` metadata must not advertise an industry vertical that has no
 * page under `app/use-cases/`.
 *
 * The layout's `keywords` are the only metadata field the index page does not
 * override (`buildMetadata` in `page.tsx` replaces title/description/openGraph/
 * twitter/canonical), so they ship verbatim on every `/use-cases/*` route. They
 * claimed "AI for healthcare" and "AI for legal" while the routed set is
 * startups, consulting, IT service providers, and sales teams — there is no
 * health or legal surface anywhere in the product, and `app/terms/page.tsx`
 * tells users not to rely on output for legal, medical, or financial decisions.
 *
 * The allowance is derived from the filesystem, not hardcoded: ship
 * `app/use-cases/healthcare/page.tsx` and "healthcare" becomes legal copy again.
 */
const USE_CASES_DIR = path.join(__dirname, '..');

/** Industry words that would each need their own vertical page to be claimable. */
const VERTICAL_TERMS = [
  'healthcare',
  'health',
  'medical',
  'legal',
  'finance',
  'financial',
  'education',
  'study mode',
  'cybersecurity',
  'travel',
  'shopping',
  'maps',
];

function routedSlugs(): string[] {
  return fs
    .readdirSync(USE_CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('__'))
    .filter((entry) => fs.existsSync(path.join(USE_CASES_DIR, entry.name, 'page.tsx')))
    .map((entry) => entry.name.toLowerCase());
}

function metadataText(): string {
  const openGraph = metadata.openGraph as { title?: string; description?: string } | undefined;
  const twitter = metadata.twitter as { title?: string; description?: string } | undefined;
  return [
    metadata.title,
    metadata.description,
    ...((metadata.keywords as string[] | undefined) ?? []),
    openGraph?.title,
    openGraph?.description,
    twitter?.title,
    twitter?.description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' | ')
    .toLowerCase();
}

describe('/use-cases metadata', () => {
  const slugs = routedSlugs();
  const text = metadataText();

  it('has at least one routed audience page to describe', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it.each(VERTICAL_TERMS)('does not claim the "%s" vertical without a page for it', (term) => {
    const hasRoute = slugs.some((slug) => slug.includes(term.replace(/\s+/g, '-')));
    if (hasRoute) return;
    expect(text, `metadata names "${term}" but app/use-cases has no page for it`).not.toContain(
      term,
    );
  });
});
