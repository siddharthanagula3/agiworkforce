import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');
const screenSource = readFileSync(join(mobileRoot, 'app', 'legal', 'article-50.tsx'), 'utf8');
const aiActSource = readFileSync(
  join(mobileRoot, '..', 'web', 'lib', 'compliance', 'ai-act.ts'),
  'utf8',
);

const MEDIA_KIND_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['text', /\btext\b/i],
  ['audio', /\baudio\b/i],
  ['image', /\bimages?\b/i],
  ['video', /\bvideos?\b/i],
];

function implementedSyntheticKinds(): string[] {
  const union = aiActSource.match(/export type SyntheticContentKind\s*=\s*([^;]+);/);
  if (!union) throw new Error('SyntheticContentKind union not found in ai-act.ts');
  return [...union[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]).sort();
}

function sectionBody(title: string): string {
  const marker = `<Section title="${title}">`;
  const start = screenSource.indexOf(marker);
  if (start === -1) throw new Error(`Section "${title}" not found`);
  const rest = screenSource.slice(start + marker.length);
  const end = rest.indexOf('<Section title="');
  const markup = end === -1 ? rest : rest.slice(0, end);
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function provenanceClaimSentence(body: string): string {
  const sentence = body.split(/(?<=\.)\s/).find((candidate) => /provenance claim/i.test(candidate));
  if (!sentence) throw new Error('No sentence claiming a provenance claim was found');
  return sentence;
}

function kindsIn(sentence: string): string[] {
  return MEDIA_KIND_PATTERNS.filter(([, pattern]) => pattern.test(sentence))
    .map(([kind]) => kind)
    .sort();
}

describe('Article 50(2) mobile disclosure', () => {
  const body = sectionBody('Article 50(2) verbatim');

  it('claims provenance marks only for the kinds the web implementation builds', () => {
    expect(kindsIn(provenanceClaimSentence(body))).toEqual(implementedSyntheticKinds());
  });

  it('never claims generated audio is marked', () => {
    expect(implementedSyntheticKinds()).not.toContain('audio');
    expect(kindsIn(provenanceClaimSentence(body))).not.toContain('audio');
  });

  it('discloses that unmarked chat text and absent audio generation are the gaps', () => {
    expect(body).toMatch(/is not marked/i);
    expect(body).toMatch(/does not generate audio/i);
  });
});
