import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseShellTokens, readShellTokens } from '../shellTokens.mjs';
import { trafficLightPosition } from '../windowChrome';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('shell tokens', () => {
  it('reads the page background and the title strip out of the design tokens', () => {
    const tokens = readShellTokens(repoRoot);

    expect(tokens.pageBackgroundLight).toMatch(/^#[0-9a-f]{6}$/u);
    expect(tokens.pageBackgroundDark).toMatch(/^#[0-9a-f]{6}$/u);
    expect(tokens.pageBackgroundLight).not.toBe(tokens.pageBackgroundDark);
    expect(tokens.titleStripHeight).toBeGreaterThan(0);
  });

  it('resolves a dark background held as hsl channels on a foundation token', () => {
    const chat = `@layer base {
      :root { --chat-bg: #FAF9F7; --chat-window-title-strip: 48px; }
      .dark { --chat-bg: hsl(var(--neutral-0)); }
    }`;
    const foundation = `@layer base {
      :root { --neutral-0: 210 50% 40%; }
    }`;

    expect(parseShellTokens(chat, foundation)).toEqual({
      pageBackgroundLight: '#faf9f7',
      pageBackgroundDark: '#336699',
      titleStripHeight: 48,
    });
  });

  it('refuses to build when the page background token is gone', () => {
    const chat = '@layer base { :root { --chat-window-title-strip: 48px; } }';

    expect(() => parseShellTokens(chat, ':root { --neutral-0: 0 0% 0%; }')).toThrow(/--chat-bg/u);
  });

  it('refuses to build when the title strip token is gone', () => {
    const chat = '@layer base { :root { --chat-bg: #ffffff; } .dark { --chat-bg: #000000; } }';

    expect(() => parseShellTokens(chat, ':root {}')).toThrow(/--chat-window-title-strip/u);
  });
});

describe('traffic light position', () => {
  it('centres the window buttons in the strip the page reserves', () => {
    expect(trafficLightPosition(48)).toEqual({ x: 13, y: 16 });
    expect(trafficLightPosition(52)).toEqual({ x: 13, y: 18 });
  });

  it('follows the token rather than a fixed offset', () => {
    const short = trafficLightPosition(40);
    const tall = trafficLightPosition(64);

    expect(tall.y - short.y).toBe(12);
    expect(tall.x).toBe(short.x);
  });
});
