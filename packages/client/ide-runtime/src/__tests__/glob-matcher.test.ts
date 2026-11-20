import { describe, expect, it } from 'vitest';
import { compileGlob, MAX_GLOB_PATTERN_CHARS, matchesGlob } from '../index';

function referenceRegExp(pattern: string, ignoreCase: boolean): RegExp {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 2;
        continue;
      }
      source += '[^/]*';
      index += 1;
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }
    source += (char ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    index += 1;
  }
  return new RegExp(`^${source}$`, ignoreCase ? 'i' : '');
}

interface ExcludeReference {
  expression: RegExp | undefined;
  opensEmptyClass: boolean;
  readsPatternSyntax: boolean;
}

function referenceExcludeRegExp(glob: string, ignoreCase: boolean): ExcludeReference {
  let source = '';
  let groupDepth = 0;
  let opensEmptyClass = false;
  let readsPatternSyntax = false;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? '';
    if (char === '*') {
      const double = glob[index + 1] === '*';
      const next = index + (double ? 2 : 1);
      const startsSegment = index === 0 || glob[index - 1] === '/';
      const endsSegment = next === glob.length || glob[next] === '/';
      if (double && startsSegment && endsSegment) {
        source += next === glob.length ? '.*' : '(?:[^/]*/)*';
        index = next === glob.length ? next - 1 : next;
        continue;
      }
      source += '[^/]*';
      index = next - 1;
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      groupDepth += 1;
      source += '(?:';
    } else if (char === '}' && groupDepth > 0) {
      groupDepth -= 1;
      source += ')';
    } else if (char === ',' && groupDepth > 0) {
      source += '|';
    } else if (char === '[' && glob.indexOf(']', index + 2) !== -1) {
      const close = glob.indexOf(']', index + 2);
      const body = glob.slice(index + 1, close);
      const negated = body.startsWith('!') || body.startsWith('^');
      const members = (negated ? body.slice(1) : body).replace(/\\/gu, '\\\\');
      if (members.startsWith(']')) {
        opensEmptyClass = true;
        const open = members.indexOf('[');
        const tail = members.slice(1, open === -1 ? undefined : open);
        if (/^(?:[*?]|\{0+[,}])|[|()]/u.test(tail)) readsPatternSyntax = true;
      }
      source += `[${negated ? '^' : ''}${members}]`;
      index = close;
    } else {
      source += char.replace(/[.+^$()|\\{}[\]]/gu, '\\$&');
    }
  }
  if (groupDepth !== 0) return { expression: undefined, opensEmptyClass, readsPatternSyntax };
  try {
    return {
      expression: new RegExp(`^${source}$`, ignoreCase ? 'iu' : 'u'),
      opensEmptyClass,
      readsPatternSyntax,
    };
  } catch {
    return { expression: undefined, opensEmptyClass, readsPatternSyntax };
  }
}

function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('glob matcher', () => {
  it('agrees with the regular expression it replaces on generated globs and paths', () => {
    const random = sequence(20_261_118);
    const patternParts = ['a', 'b', 'A', '/', '.', '*', '**', '?', '(', '+', 'é', '\n'];
    const pathParts = ['a', 'b', 'A', '/', '.', '(', '+', 'é', 'É', '\n', '\r', ' '];
    const pick = (parts: readonly string[], length: number): string =>
      Array.from({ length }, () => parts[Math.floor(random() * parts.length)]).join('');
    let compared = 0;
    for (let round = 0; round < 6_000; round += 1) {
      const pattern = pick(patternParts, Math.floor(random() * 8));
      const path = pick(pathParts, Math.floor(random() * 9));
      for (const ignoreCase of [false, true]) {
        const expected = referenceRegExp(pattern, ignoreCase).test(path);
        const actual = compileGlob(pattern, { ignoreCase })(path);
        if (actual !== expected) {
          throw new Error(
            `glob ${JSON.stringify(pattern)} on ${JSON.stringify(path)} ignoreCase=${ignoreCase}: expected ${expected}, got ${actual}`,
          );
        }
        compared += 1;
      }
    }
    expect(compared).toBe(12_000);
  });

  describe('extended syntax', () => {
    it('agrees with the u-flag expression it replaces on generated globs and paths', () => {
      const random = sequence(20_261_119);
      const patternParts = [
        'a',
        'k',
        'K',
        'K',
        's',
        'ſ',
        'σ',
        'Σ',
        '/',
        '.',
        '-',
        '!',
        ',',
        '*',
        '**',
        '**/',
        '?',
        '{',
        '}',
        '[',
        ']',
        '[a-z]',
        '[!a-k]',
        '[^/]',
        '[K]',
        '[é-ê]',
        'É',
        '\u{1F600}',
        '\n',
        '\\',
        '(',
        ')',
        '[]',
        '|',
        '+',
        '^',
      ];
      const pathParts = [
        'a',
        'k',
        'K',
        'K',
        's',
        'S',
        'ſ',
        'σ',
        'ς',
        'Σ',
        '/',
        '.',
        '-',
        '!',
        'é',
        'É',
        '\u{1F600}',
        '\uD83D',
        '\n',
        '\r',
        ' ',
        '\\',
        ',',
        '[',
        ']',
      ];
      const instances: Record<string, readonly string[]> = {
        '*': ['', 'a', 'k\n', '\u{1F600}'],
        '**': ['', 'a/k', '\n'],
        '**/': ['', 'a/', 'a\nb/k/'],
        '?': ['a', '\u{1F600}', '\n', '/'],
        '[a-z]': ['a', 'K', 'K', 'ſ'],
        '[!a-k]': ['z', 'K', '\n', '/'],
        '[^/]': ['a', '/', '\u{1F600}'],
        '[K]': ['K', 'k', 'K'],
        '[é-ê]': ['é', 'É'],
        k: ['k', 'K', 'K'],
        s: ['s', 'S', 'ſ'],
        σ: ['σ', 'ς', 'Σ'],
        '{': ['', '{'],
        '}': ['', '}'],
        ',': ['', ','],
      };
      const choose = (options: readonly string[]): string =>
        options[Math.floor(random() * options.length)] as string;
      const pickParts = (parts: readonly string[], length: number): string[] =>
        Array.from({ length }, () => choose(parts));
      const pick = (parts: readonly string[], length: number): string =>
        pickParts(parts, length).join('');
      const instantiate = (parts: readonly string[]): string =>
        parts.map((part) => choose(instances[part] ?? [part])).join('');
      let compared = 0;
      let matched = 0;
      let refused = 0;
      let emptyClasses = 0;
      for (let round = 0; round < 5_000; round += 1) {
        const parts = pickParts(patternParts, 1 + Math.floor(random() * 6));
        const pattern = parts.join('');
        for (const ignoreCase of [false, true]) {
          const reference = referenceExcludeRegExp(pattern, ignoreCase);
          let matcher: ((path: string) => boolean) | undefined;
          try {
            matcher = compileGlob(pattern, { extended: true, ignoreCase });
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
          }
          if (reference.expression === undefined) {
            if (matcher !== undefined) {
              throw new Error(`glob ${JSON.stringify(pattern)} should be refused`);
            }
            refused += 1;
            continue;
          }
          if (matcher === undefined) {
            if (!reference.readsPatternSyntax) {
              throw new Error(
                `glob ${JSON.stringify(pattern)} was refused but the old one compiled`,
              );
            }
            refused += 1;
            continue;
          }
          if (reference.opensEmptyClass) emptyClasses += 1;
          for (let sample = 0; sample < 6; sample += 1) {
            const path =
              sample % 2 === 0 ? instantiate(parts) : pick(pathParts, Math.floor(random() * 5));
            const expected = reference.expression.test(path);
            if (matcher(path) !== expected) {
              throw new Error(
                `glob ${JSON.stringify(pattern)} on ${JSON.stringify(path)} ignoreCase=${ignoreCase}: expected ${expected}`,
              );
            }
            compared += 1;
            if (expected) matched += 1;
          }
        }
      }
      expect(compared).toBeGreaterThan(40_000);
      expect(matched).toBeGreaterThan(10_000);
      expect(refused).toBeGreaterThan(100);
      expect(emptyClasses).toBeGreaterThan(100);
    });

    it.each([
      ['?.txt', '\u{1F600}.txt', true],
      ['?.txt', '\u{1F600}\u{1F600}.txt', false],
      ['x/**/y', 'x/a\nb/y', true],
      ['x/**/y', 'x/y', true],
      ['x/**', 'x/a\nb', false],
      ['[!a]*', 'b\nc', true],
      ['[!a]*', 'abc', false],
      ['**/*.[0-9][0-9]', 'a/b.42', true],
      ['**/*.[0-9][0-9]', 'a/b.4x', false],
      ['[一-鿿]', '中', true],
      ['{a,b{c,d}}x', 'bdx', true],
      ['{a,b{c,d}}x', 'bx', false],
      ['{,a}b', 'b', true],
    ])('matches %j against %j: %s', (glob, path, expected) => {
      expect(compileGlob(glob, { extended: true })(path)).toBe(expected);
    });

    it.each([
      ['K', 'K'],
      ['s', 'ſ'],
      ['σ', 'ς'],
      ['[a-z]', 'K'],
      ['É', 'é'],
    ])('folds %j onto %j with Unicode case folding', (glob, path) => {
      expect(compileGlob(glob, { extended: true, ignoreCase: true })(path)).toBe(true);
      expect(compileGlob(glob, { extended: true })(path)).toBe(false);
    });

    it('keeps a negated class negated under case folding', () => {
      expect(compileGlob('[!k]', { extended: true, ignoreCase: true })('K')).toBe(false);
      expect(compileGlob('[!k]', { extended: true })('K')).toBe(true);
    });

    it('matches a class as one state however wide it is', () => {
      const glob = '[\u0000-\u{10FFFF}]'.repeat(150);
      expect(glob.length).toBeLessThanOrEqual(MAX_GLOB_PATTERN_CHARS);
      const matches = compileGlob(glob, { extended: true, ignoreCase: true });
      expect(matches('\u{1F600}'.repeat(150))).toBe(true);
      expect(matches('a'.repeat(151))).toBe(false);
    });

    it.each([
      '{a,b',
      '[z-a]',
      '[]a]',
      '[]{0[a]',
      '[]+*[a]',
      '[]^+[a]',
      '[][z-a]',
      '[](x[y]',
      '[](?=x)*[y]',
      '[]|*[y]',
    ])('refuses the unparseable glob %j', (glob) => {
      expect(() => compileGlob(glob, { extended: true })).toThrow(SyntaxError);
    });

    it.each([
      ['[][]', ['', '[]', ']', 'a']],
      ['[]x[]', ['x', '[]x[]', 'a']],
      ['[][abc]', ['a', '[]a']],
      ['[]x.+^$\\{2}[!-z]', ['x', 'xx']],
      ['[]+?[^b]', ['a', 'b']],
      ['a/[]b[c]/d', ['a/bc/d', 'a//d']],
      ['[]|[]', ['', '|', 'a']],
      ['[]a|b[]', ['a', 'b', 'a|b']],
      ['[](x)*(?:y|z)[w]', ['xyw', 'w']],
      ['[](?=x)(?<!y)[z]', ['xz', 'z']],
      ['[]*[]', ['', '[]', 'a']],
      ['[]?[]', ['', '[]?[]', 'a']],
      ['[]{0}[]', ['', '{0}', 'a']],
      ['[]{0,2}[]', ['', 'a']],
      ['[]*?[]', ['', 'a']],
      ['[]?x[]', ['x', 'xx']],
      ['[]*x[]', ['x', 'xx']],
      ['[](?<n>x)[y]', ['xy', '(?<n>x)y']],
      ['[](?i:x)[y]', ['xy', 'Xy']],
      ['[]*$x[y]', ['xy', '$xy']],
      ['[]*x^[y]', ['xy', 'x^y']],
      ['[]*(?!)x[y]', ['xy', 'x']],
      ['[]*(?=$)x[y]', ['xy', 'x']],
      ['[]*(?<=x)[y]', ['y', 'xy']],
      ['{a,[]b)(?=[y]}', ['a', 'ay', 'by']],
      ['[]|x$y|[]', ['', 'x', 'xy', 'ax$y']],
      ['{a,[])(x[]}', ['a', 'ax', 'x', '']],
      ['[]*[]/**', ['a', 'a/b', '/b']],
    ])('reads %j as the empty class the old expression saw, matching nothing', (glob, paths) => {
      for (const ignoreCase of [false, true]) {
        const matches = compileGlob(glob, { extended: true, ignoreCase });
        for (const path of paths) expect(matches(path)).toBe(false);
      }
    });

    it.each([
      ['**/{[][],*.log}', 'logs/server.log', 'logs/server.txt'],
      ['{a,[]*[]}', 'a', '[]'],
      ['{a,[]?x[]}/b', 'a/b', 'x/b'],
      ['{[]{0}[],a}', 'a', '{0}'],
      ['{a,b[]*^[c]}', 'a', 'bc'],
      ['{a,[]|[],b}', 'b', '|'],
    ])(
      'keeps the other alternatives of %j, whose branch opens an empty class',
      (glob, kept, dropped) => {
        for (const ignoreCase of [false, true]) {
          const matches = compileGlob(glob, { extended: true, ignoreCase });
          expect(matches(kept)).toBe(true);
          expect(matches(dropped)).toBe(false);
        }
      },
    );

    it.each([
      '[]*x[y]',
      '[]?x[y]',
      '[]{0}x[y]',
      '[]{0,2}x[y]',
      '[]|x[y]',
      '[]|a|[]',
      '{a,[])|(x[y]}',
      '{{a,[])(x[]},b}',
      '[]*(?=x)x[y]',
    ])('refuses %j, whose old expression ran pattern syntax this matcher does not read', (glob) => {
      expect(() => compileGlob(glob, { extended: true })).toThrow(SyntaxError);
    });

    it('answers stacked whole-segment globstars quickly', () => {
      const started = performance.now();
      expect(compileGlob(`${'**/'.repeat(16)}*b`, { extended: true })(`${'a/'.repeat(16)}a`)).toBe(
        false,
      );
      expect(performance.now() - started).toBeLessThan(2_000);
    }, 20_000);
  });

  it('lets an earlier double star take a separator that a later single star cannot', () => {
    expect(compileGlob('**a*b')('a/ab')).toBe(true);
    expect(compileGlob('**/a*b')('x/y/ab')).toBe(true);
    expect(compileGlob('*a*b')('a/ab')).toBe(false);
  });

  it('folds case only when asked', () => {
    expect(compileGlob('SRC/*.TS')('src/index.ts')).toBe(false);
    expect(compileGlob('SRC/*.TS', { ignoreCase: true })('src/index.ts')).toBe(true);
    expect(compileGlob('É.ts', { ignoreCase: true })('é.ts')).toBe(true);
  });

  it('keeps matchesGlob normalising Windows separators', () => {
    expect(matchesGlob('src/**/*.ts', 'src\\a\\b.ts')).toBe(true);
    expect(matchesGlob('src/*.ts', 'src\\a\\b.ts')).toBe(false);
  });

  it.each([
    ['**a'.repeat(300) + '**b', 'a'.repeat(300)],
    ['*a'.repeat(500) + 'b', 'a'.repeat(400)],
    ['**/'.repeat(300) + '*b', `${'a/'.repeat(300)}a`],
    ['?*'.repeat(500) + 'z', 'a'.repeat(500)],
  ])('answers an adversarial glob quickly: %s', (pattern, path) => {
    const started = performance.now();
    expect(compileGlob(pattern)(path)).toBe(false);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('refuses a glob longer than the limit', () => {
    expect(() => compileGlob('a'.repeat(MAX_GLOB_PATTERN_CHARS))).not.toThrow();
    expect(() => compileGlob('a'.repeat(MAX_GLOB_PATTERN_CHARS + 1))).toThrow(RangeError);
  });
});
