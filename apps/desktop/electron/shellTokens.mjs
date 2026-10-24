import { readFileSync } from 'node:fs';
import path from 'node:path';

const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = '.dark';

function selectorBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return null;
}

function declaredValue(css, selector, token) {
  const block = selectorBlock(css, selector);
  if (block === null) return null;
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`, 'u').exec(block);
  return match ? match[1].trim() : null;
}

function hslChannelsToHex(channels) {
  const parts = channels.trim().split(/\s+/u);
  if (parts.length < 3) return null;
  const hue = Number.parseFloat(parts[0]);
  const saturation = Number.parseFloat(parts[1]) / 100;
  const lightness = Number.parseFloat(parts[2]) / 100;
  if (!Number.isFinite(hue) || !Number.isFinite(saturation) || !Number.isFinite(lightness)) {
    return null;
  }
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  const channel = (value) =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function resolveColour(value, foundationCss, selector) {
  if (/^#[0-9a-f]{6}$/iu.test(value)) return value.toLowerCase();
  const indirect = /^hsl\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)$/u.exec(value);
  if (!indirect) return null;
  const channels =
    declaredValue(foundationCss, selector, indirect[1]) ??
    declaredValue(foundationCss, LIGHT_SELECTOR, indirect[1]);
  return channels === null ? null : hslChannelsToHex(channels);
}

function requirePixels(chatCss, token) {
  const value = declaredValue(chatCss, LIGHT_SELECTOR, token);
  const pixels = value === null ? Number.NaN : Number.parseFloat(value);
  if (!Number.isFinite(pixels)) {
    throw new Error(`${token} is missing from the design tokens`);
  }
  return pixels;
}

function requireThemeColour(chatCss, foundationCss, token) {
  const light = declaredValue(chatCss, LIGHT_SELECTOR, token);
  const dark = declaredValue(chatCss, DARK_SELECTOR, token);
  if (light === null || dark === null) {
    throw new Error(`${token} is missing from the design tokens`);
  }
  const resolvedLight = resolveColour(light, foundationCss, LIGHT_SELECTOR);
  const resolvedDark = resolveColour(dark, foundationCss, DARK_SELECTOR);
  if (resolvedLight === null || resolvedDark === null) {
    throw new Error(`${token} does not resolve to a colour the shell can paint`);
  }
  return { light: resolvedLight, dark: resolvedDark };
}

/**
 * What the shell needs from the design tokens before it can open a window: the
 * colour it paints behind a page that has not drawn yet, the ink its own
 * screens write in, the height of the band it hands back to that page when it
 * hides the native title bar, and how far into that band the window buttons
 * reach.
 */
export function parseShellTokens(chatCss, foundationCss) {
  const background = requireThemeColour(chatCss, foundationCss, '--chat-bg');
  const ink = requireThemeColour(chatCss, foundationCss, '--chat-fg');
  const secondaryInk = requireThemeColour(chatCss, foundationCss, '--chat-text-secondary');
  return {
    pageBackgroundLight: background.light,
    pageBackgroundDark: background.dark,
    pageInkLight: ink.light,
    pageInkDark: ink.dark,
    pageSecondaryInkLight: secondaryInk.light,
    pageSecondaryInkDark: secondaryInk.dark,
    titleStripHeight: requirePixels(chatCss, '--chat-window-title-strip'),
    titleStripInset: requirePixels(chatCss, '--chat-window-title-strip-inset'),
  };
}

export function readShellTokens(repoRoot) {
  const tokens = path.join(repoRoot, 'packages', 'ui', 'design-tokens', 'src');
  return parseShellTokens(
    readFileSync(path.join(tokens, 'chat.css'), 'utf8'),
    readFileSync(path.join(tokens, 'foundation.css'), 'utf8'),
  );
}
