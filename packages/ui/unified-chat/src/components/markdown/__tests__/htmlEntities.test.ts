import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { decodeCharacterReference, decodeHtmlEntities } from '../htmlEntities';
import { HTML_NAMED_CHARACTER_REFERENCES } from '../htmlNamedCharacterReferences';

async function markdownParserReferences(): Promise<Record<string, string>> {
  let resolve = createRequire(import.meta.url).resolve;
  let path = resolve('remark-parse');
  for (const next of [
    'mdast-util-from-markdown',
    'decode-named-character-reference',
    'character-entities',
  ]) {
    resolve = createRequire(path).resolve;
    path = resolve(next);
  }
  const module = (await import(pathToFileURL(path).href)) as {
    characterEntities: Record<string, string>;
  };
  return module.characterEntities;
}

function markdownText(source: string): string {
  const tree = unified().use(remarkParse).parse(source) as {
    children: Array<{ children?: Array<{ value?: string }> }>;
  };
  return tree.children[0]?.children?.map((child) => child.value ?? '').join('') ?? '';
}

describe('the shared HTML character reference table', () => {
  it('holds exactly the named references the web markdown parser decodes', async () => {
    const parser = await markdownParserReferences();
    expect(Object.keys(HTML_NAMED_CHARACTER_REFERENCES).length).toBe(Object.keys(parser).length);
    expect({ ...HTML_NAMED_CHARACTER_REFERENCES }).toEqual(parser);
  });

  it('decodes each name to what web shows for it', () => {
    for (const name of ['alpha', 'check', 'CounterClockwiseContourIntegral', 'fjlig', 'Afr']) {
      expect(decodeHtmlEntities(`&${name};`)).toBe(markdownText(`&${name};`));
    }
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes the less common names the old mobile table missed', () => {
    expect(decodeHtmlEntities('&alpha; &check; &Afr; &fjlig;')).toBe('α ✓ \u{1d504} fj');
  });

  it('decodes decimal and hexadecimal references', () => {
    expect(decodeHtmlEntities('&#945;&#x3B1;&#X1F600;')).toBe('αα\u{1f600}');
  });

  it('leaves an unknown, inherited or out-of-range reference as written', () => {
    const written = '&notaname; &constructor; &toString; &#0; &#x110000; &#xD800; &#12345678;';
    expect(decodeHtmlEntities(written)).toBe(written);
  });

  it('leaves a name without its semicolon as written, as markdown does', () => {
    expect(decodeHtmlEntities('AT&T &amp tea')).toBe('AT&T &amp tea');
  });

  it('decodes adjacent references and keeps the text around them', () => {
    expect(decodeHtmlEntities('a &lt;b&gt; &amp;&amp; c')).toBe('a <b> && c');
  });

  it('decodes a streamed prefix once its reference is complete', () => {
    expect(decodeHtmlEntities('pi is &pi')).toBe('pi is &pi');
    expect(decodeHtmlEntities('pi is &pi;')).toBe('pi is π');
  });
});

describe('decodeCharacterReference', () => {
  it('answers one reference body or null', () => {
    expect(decodeCharacterReference('alpha')).toBe('α');
    expect(decodeCharacterReference('#x3b1')).toBe('α');
    expect(decodeCharacterReference('#xZZ')).toBeNull();
    expect(decodeCharacterReference('hasOwnProperty')).toBeNull();
    expect(decodeCharacterReference('nope')).toBeNull();
  });
});
