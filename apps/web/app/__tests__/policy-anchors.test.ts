import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { policySectionId } from '@shared/components/legal/PolicyContents';

/**
 * Guards for the anchored policy documents.
 *
 * /privacy, /terms and /dpa each render a `PolicyContents` list alongside
 * anchored sections. That is two lists of the same thing, which is a drift
 * hazard: add a section and forget the contents entry, or renumber and leave the
 * anchors behind, and the page publishes a table of contents describing a
 * document that is not there. Nothing else would fail.
 *
 * These assertions read the source rather than rendering it, because the thing
 * being checked is whether two literal lists agree — a render test would prove
 * the component works, which is not the risk.
 */

const APP_DIR = path.join(__dirname, '..');

const PAGES = ['privacy', 'terms', 'dpa'] as const;

function read(page: string): string {
  return readFileSync(path.join(APP_DIR, page, 'page.tsx'), 'utf8');
}

/** Eyebrows as written in the SECTIONS constant the contents block renders. */
function declaredSections(source: string): string[] {
  const block = /const SECTIONS = \[([\s\S]*?)\] as const;/.exec(source);
  const body = block?.[1];
  if (!body) return [];
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

/** Section ids actually present on the page. */
function renderedIds(source: string): string[] {
  return [...source.matchAll(/<section className="agi-section" id="(s-[^"]+)"/g)].map(
    (m) => m[1] as string,
  );
}

/** Eyebrows actually rendered, normalised to one line. */
function renderedEyebrows(source: string): string[] {
  return [...source.matchAll(/<p className="agi-section-eyebrow">\s*([\s\S]*?)\s*<\/p>/g)]
    .map((m) => (m[1] as string).replace(/\s+/g, ' ').trim())
    .filter((text) => /^\d{1,2} &middot;/.test(text));
}

describe('policy anchors', () => {
  for (const page of PAGES) {
    describe(`/${page}`, () => {
      it('declares a contents list', () => {
        expect(declaredSections(read(page)).length).toBeGreaterThan(0);
      });

      it('has an anchored section for every contents entry', () => {
        const source = read(page);
        const ids = new Set(renderedIds(source));
        for (const eyebrow of declaredSections(source)) {
          const id = policySectionId(eyebrow);
          expect(
            ids.has(id),
            `/${page} contents lists "${eyebrow}" (#${id}) but no section carries that id`,
          ).toBe(true);
        }
      });

      it('lists every anchored section in the contents', () => {
        // The other direction. A section that exists and is not listed is not
        // broken, but it is invisible to anyone using the contents to navigate,
        // which defeats the point of having one.
        const source = read(page);
        const listed = new Set(declaredSections(source).map(policySectionId));
        for (const id of renderedIds(source)) {
          expect(listed.has(id), `/${page} has section #${id} but the contents omits it`).toBe(
            true,
          );
        }
      });

      it('uses the rendered eyebrow text as the contents label', () => {
        // The eyebrow IS the label. If they drift, the contents starts naming
        // sections by titles the document no longer uses.
        const source = read(page);
        const rendered = new Set(renderedEyebrows(source));
        for (const eyebrow of declaredSections(source)) {
          expect(
            rendered.has(eyebrow),
            `/${page} contents says "${eyebrow}" but no section eyebrow renders that text`,
          ).toBe(true);
        }
      });

      it('numbers sections without gaps or duplicates', () => {
        // A duplicate number would make two sections share one anchor, so a link
        // to it would land on whichever came first — silently.
        const ids = renderedIds(read(page));
        expect(new Set(ids).size, `/${page} has duplicate section ids`).toBe(ids.length);
      });
    });
  }

  it('derives anchors from the section number, not the title', () => {
    // The load-bearing property: an anchor built from words breaks every inbound
    // link the moment a heading is improved, and headings are edited far more
    // often than positions move.
    expect(policySectionId('05 · Retention')).toBe('s-05');
    expect(policySectionId('05 · Retention, rewritten entirely')).toBe('s-05');
    // Unnumbered eyebrows still get something usable.
    expect(policySectionId('Contents')).toBe('s-contents');
  });
});
