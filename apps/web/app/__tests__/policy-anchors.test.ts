import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { policySectionId } from '@shared/components/legal/PolicyContents';

const APP_DIR = path.join(__dirname, '..');

const PAGES = ['privacy', 'terms', 'dpa'] as const;

function read(page: string): string {
  return readFileSync(path.join(APP_DIR, page, 'page.tsx'), 'utf8');
}

function declaredSections(source: string): string[] {
  const block = /const SECTIONS = \[([\s\S]*?)\] as const;/.exec(source);
  const body = block?.[1];
  if (!body) return [];
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

function renderedIds(source: string): string[] {
  return [...source.matchAll(/<section className="agi-section" id="(s-[^"]+)"/g)].map(
    (m) => m[1] as string,
  );
}

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
        const source = read(page);
        const listed = new Set(declaredSections(source).map(policySectionId));
        for (const id of renderedIds(source)) {
          expect(listed.has(id), `/${page} has section #${id} but the contents omits it`).toBe(
            true,
          );
        }
      });

      it('uses the rendered eyebrow text as the contents label', () => {
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
        const ids = renderedIds(read(page));
        expect(new Set(ids).size, `/${page} has duplicate section ids`).toBe(ids.length);
      });
    });
  }

  it('derives anchors from the section number, not the title', () => {
    expect(policySectionId('05 · Retention')).toBe('s-05');
    expect(policySectionId('05 · Retention, rewritten entirely')).toBe('s-05');
    expect(policySectionId('Contents')).toBe('s-contents');
  });
});
