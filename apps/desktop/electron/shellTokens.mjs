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

/**
 * What the shell needs from the design tokens before it can open a window: the
 * colour it paints behind a page that has not drawn yet, and the height of the
 * band it hands back to that page when it hides the native title bar.
 */
export function parseShellTokens(chatCss, foundationCss) {
  const light = declaredValue(chatCss, LIGHT_SELECTOR, '--chat-bg');
  const dark = declaredValue(chatCss, DARK_SELECTOR, '--chat-bg');
  if (light === null || dark === null) {
    throw new Error('--chat-bg is missing from the design tokens');
  }
  const pageBackgroundLight = resolveColour(light, foundationCss, LIGHT_SELECTOR);
  const pageBackgroundDark = resolveColour(dark, foundationCss, DARK_SELECTOR);
  if (pageBackgroundLight === null || pageBackgroundDark === null) {
    throw new Error('--chat-bg does not resolve to a colour the shell can paint');
  }
  return {
    pageBackgroundLight,
    pageBackgroundDark,
    titleStripHeight: requirePixels(chatCss, '--chat-window-title-strip'),
  };
}

export function readShellTokens(repoRoot) {
  const tokens = path.join(repoRoot, 'packages', 'ui', 'design-tokens', 'src');
  return parseShellTokens(
    readFileSync(path.join(tokens, 'chat.css'), 'utf8'),
    readFileSync(path.join(tokens, 'foundation.css'), 'utf8'),
  );
}
