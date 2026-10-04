import { describe, expect, it } from 'vitest';

import {
  archivedPolicyText,
  policyHistories,
  type ArchivedPolicyText,
  type PolicyBlock,
  type PolicySegment,
} from '../policy-archive';

const CONTINUES_A_SENTENCE = /^[\p{Ll}\p{Pd},.;:!?)\]}\u201D\u2019]/u;

function plain(segments: readonly PolicySegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

function archivedVersions(): { name: string; text: ArchivedPolicyText }[] {
  return policyHistories().flatMap((history) =>
    history.versions
      .filter((version) => version.status === 'archived')
      .flatMap((version) => {
        const text = archivedPolicyText(history.key, version.date);
        return text ? [{ name: `${history.key} ${version.date}`, text }] : [];
      }),
  );
}

function openings(block: PolicyBlock): string[] {
  if (block.type === 'paragraph') return [plain(block.content)];
  if (block.type === 'list') return block.items.map(plain);
  return [];
}

function archived(key: string, date: string): ArchivedPolicyText {
  const text = archivedPolicyText(key, date);
  if (!text) throw new Error(`${key} ${date} is not archived`);
  return text;
}

describe('archived policy text', () => {
  it('covers every version the histories say is archived', () => {
    const expected = policyHistories().flatMap((history) =>
      history.versions
        .filter((version) => version.status === 'archived')
        .map((version) => `${history.key} ${version.date}`),
    );

    expect(expected.length).toBeGreaterThan(0);
    expect(archivedVersions().map((version) => version.name)).toEqual(expected);
  });

  it('never ends a version on a heading with nothing under it', () => {
    for (const { name, text } of archivedVersions()) {
      expect(text.blocks.at(-1)?.type, name).not.toBe('heading');
    }
  });

  it('never opens a paragraph or list item partway through a sentence', () => {
    for (const { name, text } of archivedVersions()) {
      for (const block of text.blocks) {
        for (const opening of openings(block)) {
          expect(opening, `${name}: "${opening.slice(0, 60)}"`).not.toMatch(CONTINUES_A_SENTENCE);
        }
      }
    }
  });

  it('opens the cookie choices of 2026-09-12 with the label of the control the page showed, as plain text', () => {
    const { blocks } = archived('cookies', '2026-09-12');
    const heading = blocks.findIndex(
      (block) => block.type === 'heading' && block.anchor === 's-05',
    );
    const choices = blocks[heading + 1];

    expect(heading).toBeGreaterThanOrEqual(0);
    expect(choices?.type).toBe('paragraph');
    if (choices?.type !== 'paragraph') return;
    expect(plain(choices.content)).toMatch(
      /^Change your cookie preferences at any time: analytics stays off until you turn it on/,
    );
    expect(choices.content[0]?.href).toBeUndefined();
  });

  it('closes the trust posture of 2026-09-12 with the six links its last heading introduced', () => {
    const { blocks } = archived('trust', '2026-09-12');
    const heading = blocks.at(-2);
    const links = blocks.at(-1);

    expect(heading?.type).toBe('heading');
    if (heading?.type !== 'heading') return;
    expect(plain(heading.content)).toBe('Go deeper on any of it.');
    expect(links).toEqual({
      type: 'list',
      items: [
        [{ text: 'Security mechanisms', href: '/security' }],
        [{ text: 'Live status', href: '/status' }],
        [{ text: 'Privacy policy', href: '/privacy' }],
        [{ text: 'Subprocessors', href: '/subprocessors' }],
        [{ text: 'Data processing addendum', href: '/dpa' }],
        [{ text: 'Service levels', href: '/sla' }],
      ],
    });
  });
});
