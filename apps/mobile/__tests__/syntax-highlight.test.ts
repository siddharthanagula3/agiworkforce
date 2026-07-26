import {
  tokenizeCode,
  syntaxTokenColor,
  MAX_HIGHLIGHT_LENGTH,
  type SyntaxToken,
} from '../src/features/chat/utils/syntaxHighlight';
import { lightColors, colors as darkColors } from '../src/ui/theme';

function tokensOfType(tokens: SyntaxToken[], type: SyntaxToken['type']): string[] {
  return tokens.filter((t) => t.type === type).map((t) => t.text);
}

function joined(tokens: SyntaxToken[]): string {
  return tokens.map((t) => t.text).join('');
}

interface Rgb {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseColor(color: string): Rgb {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((part) => part + part)
            .join('')
        : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: 1,
    };
  }

  const channels = color.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${color}`);
  return {
    red: channels[0]!,
    green: channels[1]!,
    blue: channels[2]!,
    alpha: channels[3] ?? 1,
  };
}

function flatten(foreground: Rgb, background: Rgb): Rgb {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function relativeLuminance(color: Rgb): number {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const parsedBackground = parseColor(background);
  const flattenedForeground = flatten(parseColor(foreground), parsedBackground);
  const lighter = Math.max(
    relativeLuminance(flattenedForeground),
    relativeLuminance(parsedBackground),
  );
  const darker = Math.min(
    relativeLuminance(flattenedForeground),
    relativeLuminance(parsedBackground),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('tokenizeCode', () => {
  it('tokenizes js keywords, strings, numbers, and comments', () => {
    const code = `// setup\nconst answer = 42;\nlet name = "world";`;
    const tokens = tokenizeCode(code, 'js');

    expect(tokensOfType(tokens, 'comment')).toEqual(['// setup']);
    expect(tokensOfType(tokens, 'keyword')).toEqual(['const', 'let']);
    expect(tokensOfType(tokens, 'number')).toEqual(['42']);
    expect(tokensOfType(tokens, 'string')).toEqual(['"world"']);
    expect(joined(tokens)).toBe(code);
  });

  it('handles strings with escaped quotes', () => {
    const code = String.raw`const s = "say \"hi\" now"; const t = 'it\'s';`;
    const tokens = tokenizeCode(code, 'typescript');

    expect(tokensOfType(tokens, 'string')).toEqual([
      String.raw`"say \"hi\" now"`,
      String.raw`'it\'s'`,
    ]);
    expect(joined(tokens)).toBe(code);
  });

  it('does not treat quotes inside comments as strings', () => {
    const code = `// this "quote" isn't a string\nreturn 1;`;
    const tokens = tokenizeCode(code, 'js');

    expect(tokensOfType(tokens, 'comment')).toEqual([`// this "quote" isn't a string`]);
    expect(tokensOfType(tokens, 'string')).toEqual([]);
  });

  it('does not treat comment markers inside strings as comments', () => {
    const code = `const url = "https://example.com";`;
    const tokens = tokenizeCode(code, 'js');

    expect(tokensOfType(tokens, 'comment')).toEqual([]);
    expect(tokensOfType(tokens, 'string')).toEqual(['"https://example.com"']);
  });

  it('tokenizes python hash comments and triple-quoted strings', () => {
    const code = `def greet():\n    """docstring with 'quotes'"""\n    # comment\n    return 3.14`;
    const tokens = tokenizeCode(code, 'python');

    expect(tokensOfType(tokens, 'keyword')).toEqual(['def', 'return']);
    expect(tokensOfType(tokens, 'string')).toEqual([`"""docstring with 'quotes'"""`]);
    expect(tokensOfType(tokens, 'comment')).toEqual(['# comment']);
    expect(tokensOfType(tokens, 'number')).toEqual(['3.14']);
  });

  it('matches sql keywords case-insensitively', () => {
    const code = `SELECT id FROM users WHERE age > 21; -- adults`;
    const tokens = tokenizeCode(code, 'sql');

    expect(tokensOfType(tokens, 'keyword')).toEqual(['SELECT', 'FROM', 'WHERE']);
    expect(tokensOfType(tokens, 'number')).toEqual(['21']);
    expect(tokensOfType(tokens, 'comment')).toEqual(['-- adults']);
  });

  it('tokenizes json literals and strings', () => {
    const code = `{"ok": true, "count": 12, "label": null}`;
    const tokens = tokenizeCode(code, 'json');

    expect(tokensOfType(tokens, 'string')).toEqual(['"ok"', '"count"', '"label"']);
    expect(tokensOfType(tokens, 'keyword')).toEqual(['true', 'null']);
    expect(tokensOfType(tokens, 'number')).toEqual(['12']);
  });

  it('falls back to a single plain token for unknown languages', () => {
    const code = `const x = 1; // not highlighted`;
    expect(tokenizeCode(code, 'brainfuck')).toEqual([{ text: code, type: 'plain' }]);
    expect(tokenizeCode(code, undefined)).toEqual([{ text: code, type: 'plain' }]);
  });

  it('falls back to a single plain token for oversize input', () => {
    const code = `// c\n${'x'.repeat(MAX_HIGHLIGHT_LENGTH)}`;
    expect(tokenizeCode(code, 'js')).toEqual([{ text: code, type: 'plain' }]);
  });

  it('returns no tokens for empty input', () => {
    expect(tokenizeCode('', 'js')).toEqual([]);
  });

  it('reassembles the exact source for every supported language', () => {
    const samples: Array<[string, string]> = [
      ['ts', `interface P { n: number }\nconst p: P = { n: 0x1f };`],
      ['sh', `#!/bin/sh\nif [ -f "$1" ]; then echo 'found'; fi`],
      ['html', `<!-- nav --><a href="/home" class='top'>Home</a>`],
      ['css', `/* base */ .btn { width: 100%; content: "»"; }`],
      ['rust', `fn main() { let x = 5; println!("{}", x); // done\n}`],
      ['go', `func main() { s := "hi" // greet\n}`],
      ['java', `// entry\npublic static void main(String[] args) { int i = 0; }`],
      ['swift', `let msg = "hello" // greeting`],
    ];
    for (const [lang, code] of samples) {
      expect(joined(tokenizeCode(code, lang))).toBe(code);
    }
  });
});

describe('syntaxTokenColor', () => {
  it('keeps every token at 4.5:1 on inline and fullscreen code backgrounds', () => {
    for (const scheme of [lightColors, darkColors]) {
      for (const background of [scheme.surfaceHover, scheme.surfaceBase]) {
        for (const tokenType of ['comment', 'string', 'number', 'keyword', 'plain'] as const) {
          expect(
            contrastRatio(syntaxTokenColor(tokenType, scheme), background),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('falls back to primary text when a legacy theme omits a code-surface token', () => {
    const legacyTheme = { ...darkColors, surfaceHover: undefined as never };

    expect(syntaxTokenColor('keyword', legacyTheme)).toBe(darkColors.textPrimary);
  });
});
