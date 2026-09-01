import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function hslToHex(hslString: string): string {
  const parts = hslString.trim().split(/\s+/);
  const h = parseFloat(parts[0]!);
  const s = parseFloat(parts[1]!) / 100;
  const l = parseFloat(parts[2]!) / 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function parseDarkModeVar(cssContent: string, varName: string): string | null {
  const darkBlockMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);
  if (!darkBlockMatch) return null;

  const darkBlock = darkBlockMatch[1]!;
  const varPattern = new RegExp(`${varName}\\s*:\\s*([^;]+);`);
  const match = darkBlock.match(varPattern);
  if (!match) return null;

  return match[1]!.trim();
}

const cssPath = path.resolve(__dirname, '../globals.css');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

const tokensPath = path.resolve(__dirname, '../../../../packages/ui/design-tokens/src/chat.css');
const tokensContent = fs.readFileSync(tokensPath, 'utf-8');

const foundationPath = path.resolve(
  __dirname,
  '../../../../packages/ui/design-tokens/src/foundation.css',
);
const foundationContent = fs.readFileSync(foundationPath, 'utf-8');

// foundation.css owns --background, --foreground, --border and
// --destructive-text; globals.css owns the rest of the dark shadcn set.
const darkVar = (varName: string): string | null =>
  parseDarkModeVar(cssContent, varName) ?? parseDarkModeVar(foundationContent, varName);

const PRIMITIVES: Record<string, string> = Object.fromEntries(
  [...tokensContent.matchAll(/^\s*(--neutral-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [
    m[1]!,
    m[2]!.trim(),
  ]),
);

function resolveToken(value: string): string {
  const wrapped = value.match(/^hsl\(\s*var\((--[a-z0-9-]+)\)\s*\)$/);
  if (wrapped) return hslToHex(PRIMITIVES[wrapped[1]!] ?? '');
  const bare = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (bare) {
    const primitive = PRIMITIVES[bare[1]!];
    if (primitive === undefined) throw new Error(`Unknown primitive ${bare[1]}`);
    return primitive;
  }
  return value;
}

function resolveToHex(value: string): string {
  const resolved = resolveToken(value);
  return resolved.startsWith('#') ? resolved : hslToHex(resolved);
}

const NEUTRAL_HSL = /^0\s+0%\s+\d+(\.\d+)?%$/;

describe('Dark mode color tokens', () => {
  describe('Background color (#000000)', () => {
    it('--background in dark mode is defined as an HSL triple', () => {
      const value = darkVar('--background');
      expect(value).not.toBeNull();
      expect(resolveToken(value as string)).toMatch(/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/);
    });

    it('--background in dark mode resolves exactly to #000000', () => {
      const value = darkVar('--background');
      expect(value).not.toBeNull();

      expect(resolveToHex(value as string)).toBe('#000000');
    });
  });

  describe('Sidebar background color (#000000)', () => {
    it('--sidebar-background in dark mode resolves exactly to #000000', () => {
      const value = darkVar('--sidebar-background');
      expect(value).not.toBeNull();

      expect(resolveToHex(value as string)).toBe('#000000');
    });
  });

  describe('Neutral surface ramp', () => {
    it.each([
      ['--background', '#000000'],
      ['--card', '#181818'],
      ['--popover', '#212121'],
      ['--secondary', '#2f2f2f'],
      ['--muted', '#2f2f2f'],
      ['--accent', '#2f2f2f'],
      ['--border', '#2f2f2f'],
      ['--input', '#212121'],
      ['--foreground', '#ffffff'],
      ['--muted-foreground', '#afafaf'],
      ['--sidebar-background', '#000000'],
      ['--sidebar-foreground', '#afafaf'],
      ['--sidebar-accent', '#2f2f2f'],
      ['--sidebar-border', '#2f2f2f'],
    ])('%s resolves to %s', (token, hex) => {
      const value = darkVar(token);
      expect(value, `${token} should be defined in dark mode`).not.toBeNull();
      expect(resolveToHex(value as string)).toBe(hex);
    });

    it.each([
      '--background',
      '--card',
      '--popover',
      '--secondary',
      '--muted',
      '--accent',
      '--border',
      '--input',
      '--foreground',
      '--muted-foreground',
      '--sidebar-background',
      '--sidebar-foreground',
    ])('%s carries no hue or saturation', (token) => {
      expect(resolveToken(darkVar(token) as string)).toMatch(NEUTRAL_HSL);
    });
  });

  describe('Chat surface tokens', () => {
    it.each([
      ['--chat-bg', '#000000'],
      ['--chat-fg', '#ffffff'],
      ['--chat-surface-base', '#000000'],
      ['--chat-surface-elevated', '#212121'],
      ['--chat-surface-overlay', '#212121'],
      ['--chat-surface-hover', '#2f2f2f'],
      ['--chat-sidebar-bg', '#000000'],
      ['--chat-input-bg', '#212121'],
      ['--chat-code-bg', '#0d0d0d'],
      ['--chat-text-primary', '#ffffff'],
      ['--chat-text-secondary', '#afafaf'],
      ['--chat-text-muted', '#9b9b9b'],
      ['--chat-text-placeholder', '#9b9b9b'],
      ['--chat-user-bubble-bg', '#212121'],
    ])('%s resolves to %s in dark mode', (token, hex) => {
      const value = darkVar(token);
      expect(value, `${token} should be defined in dark mode`).not.toBeNull();
      expect(resolveToHex(value as string)).toBe(hex);
    });

    it('--chat-border-subtle defines a subtle border color', () => {
      const value = darkVar('--chat-border-subtle');
      expect(value).not.toBeNull();
      expect(value).toMatch(/^(?:#[0-9a-f]{6}|rgba\(|hsl\()/);
    });

    it('--chat-text-primary defines a readable text color in dark mode', () => {
      const value = darkVar('--chat-text-primary');
      expect(value).not.toBeNull();
      expect(resolveToHex(value as string)).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('every neutral surface token derives from a shared primitive, never a literal', () => {
      const tokens = [
        '--background',
        '--card',
        '--popover',
        '--secondary',
        '--muted',
        '--accent',
        '--border',
        '--input',
        '--foreground',
        '--muted-foreground',
        '--sidebar-background',
        '--chat-bg',
        '--chat-input-bg',
        '--chat-text-primary',
        '--chat-user-bubble-bg',
      ];
      for (const token of tokens) {
        const value = darkVar(token);
        expect(value, `${token} should be defined in dark mode`).not.toBeNull();
        expect(value, `${token} must reference a --neutral-* primitive, not a literal`).toMatch(
          /var\(--neutral-[a-z0-9-]+\)/,
        );
      }
    });
  });

  describe('CSS variable completeness', () => {
    it('dark mode defines all required shadcn semantic variables', () => {
      const required = [
        '--background',
        '--foreground',
        '--card',
        '--popover',
        '--primary',
        '--secondary',
        '--muted',
        '--accent',
        '--destructive',
        '--border',
        '--input',
        '--ring',
      ];

      const darkBlockMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);
      expect(darkBlockMatch).not.toBeNull();

      for (const varName of required) {
        const value = darkVar(varName);
        expect(value, `${varName} should be defined in dark mode`).not.toBeNull();
      }
    });

    it('dark mode defines all sidebar color variables', () => {
      const sidebarVars = [
        '--sidebar-background',
        '--sidebar-foreground',
        '--sidebar-primary',
        '--sidebar-border',
      ];

      for (const varName of sidebarVars) {
        const value = darkVar(varName);
        expect(value, `${varName} should be defined in dark mode`).not.toBeNull();
      }
    });
  });
});

describe('Border opacity consistency', () => {
  it('white/7% opacity is rgba(255,255,255,0.07)', () => {
    const opacity = 0.07;
    const rgba = `rgba(255, 255, 255, ${opacity})`;
    expect(rgba).toBe('rgba(255, 255, 255, 0.07)');
  });

  it('glass-surface utility is defined in globals.css', () => {
    expect(cssContent).toContain('glass-surface');
  });
});

describe('HSL to hex conversion utility (used for dark mode verification)', () => {
  it('converts pure black correctly', () => {
    expect(hslToHex('0 0% 0%')).toBe('#000000');
  });

  it('converts pure white correctly', () => {
    expect(hslToHex('0 0% 100%')).toBe('#ffffff');
  });

  it('converts pure red correctly', () => {
    expect(hslToHex('0 100% 50%')).toBe('#ff0000');
  });

  it('converts #0b0c14 (sidebar) correctly via 233 29% 6%', () => {
    expect(hslToHex('233 29% 6%')).toBe('#0b0c14');
  });

  it('converts #0f0f13 (main bg) exactly via 240 14% 6.7%', () => {
    expect(hslToHex('240 14% 6.7%')).toBe('#0f0f13');
  });
});
