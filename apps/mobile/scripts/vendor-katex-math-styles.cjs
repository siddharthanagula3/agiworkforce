#!/usr/bin/env node
/* global console */

const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const process = require('node:process');

const OUT_FILE = resolve(__dirname, '../assets/katex-math-styles.json');
const UNIFIED_CHAT_DIR = resolve(__dirname, '../../../packages/ui/unified-chat');
const FONT_FACE = /@font-face\{([^}]*)\}/g;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const KATEX_FAMILY = /\bfont(?:-family)?:[^;}]*?\b(KaTeX_[A-Za-z0-9]+)/;

function katexDist() {
  const packageJson = require.resolve('katex/package.json', { paths: [UNIFIED_CHAT_DIR] });
  const root = dirname(packageJson);
  return {
    version: JSON.parse(readFileSync(packageJson, 'utf8')).version,
    dist: join(root, 'dist'),
  };
}

function declaration(body, name) {
  const match = new RegExp(`(?:^|;)${name}:([^;]+)`).exec(body);
  if (!match) throw new Error(`KaTeX @font-face without ${name}: ${body}`);
  return match[1].trim();
}

function embeddedFontFace(body, dist) {
  const family = declaration(body, 'font-family').replace(/^"(.*)"$/, '$1');
  const woff2 = /url\(([^)]+\.woff2)\)/.exec(body);
  if (!woff2) throw new Error(`KaTeX @font-face without a woff2 source: ${body}`);
  const data = readFileSync(join(dist, woff2[1])).toString('base64');
  const style = declaration(body, 'font-style');
  const weight = declaration(body, 'font-weight');
  const rule =
    `@font-face{font-display:block;font-family:${family};` +
    `font-style:${style};font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${data}) format("woff2")}`;
  return { family, face: { style: fontStyle(style), weight: fontWeight(weight), rule } };
}

function fontWeight(value) {
  const weight = { normal: '400', bold: '700', 400: '400', 700: '700' }[value];
  if (!weight) throw new Error(`KaTeX font weight ${value} is not one the face rules know`);
  return weight;
}

function fontStyle(value) {
  if (value !== 'normal' && value !== 'italic') {
    throw new Error(`KaTeX font style ${value} is not one the face rules know`);
  }
  return value;
}

function shorthandFace(value) {
  const tokens = value.split(/\s+/);
  return {
    style: tokens.includes('italic') ? 'italic' : 'normal',
    weight: tokens.some((token) => token === 'bold' || token === '700') ? '700' : '400',
  };
}

function faceDeclarations(body) {
  const family = KATEX_FAMILY.exec(body)?.[1] ?? null;
  const shorthand = /(?:^|;)font:([^;]+)/.exec(body);
  const style = /(?:^|;)font-style:([^;]+)/.exec(body);
  const weight = /(?:^|;)font-weight:([^;]+)/.exec(body);
  const fromShorthand = shorthand ? shorthandFace(shorthand[1].trim()) : null;
  return {
    family,
    style: style ? fontStyle(style[1].trim()) : (fromShorthand?.style ?? null),
    weight: weight ? fontWeight(weight[1].trim()) : (fromShorthand?.weight ?? null),
  };
}

function faceRules(stylesheet, fontFaces) {
  const rules = [];
  for (const [, selectors, body] of stylesheet.matchAll(RULE)) {
    const { family, style, weight } = faceDeclarations(body);
    const choosesFace = style !== null || weight !== null || (fontFaces[family]?.length ?? 0) > 1;
    if (!choosesFace) continue;
    for (const selector of selectors.split(',').map((part) => part.trim())) {
      const root = selector === '.katex';
      const descendant = /^\.katex \.([A-Za-z0-9_-]+)$/.exec(selector);
      if (!root && !descendant) {
        throw new Error(
          `KaTeX rule ${selector} chooses a font face through a selector the face rules cannot follow`,
        );
      }
      rules.push({ className: root ? 'katex' : descendant[1], root, family, style, weight });
    }
  }
  return rules.sort((a, b) => Number(b.root) - Number(a.root));
}

function fontClasses(stylesheet) {
  const seen = new Set();
  const entries = [];
  for (const [, selectors, body] of stylesheet.matchAll(RULE)) {
    const family = KATEX_FAMILY.exec(body)?.[1];
    if (!family) continue;
    for (const selector of selectors.split(',')) {
      const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
      if (classes.length === 0) continue;
      const key = `${family}:${classes.join('.')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ family, classes });
    }
  }
  return entries;
}

function buildKatexMathStyles() {
  const { version, dist } = katexDist();
  const css = readFileSync(join(dist, 'katex.min.css'), 'utf8');
  const fontFaces = {};
  for (const [, body] of css.matchAll(FONT_FACE)) {
    const { family, face } = embeddedFontFace(body, dist);
    (fontFaces[family] ??= []).push(face);
  }
  const stylesheet = css.replace(FONT_FACE, '');
  return {
    katexVersion: version,
    stylesheet,
    fontFaces,
    fontClasses: fontClasses(stylesheet),
    faceRules: faceRules(stylesheet, fontFaces),
  };
}

if (require.main === module) {
  const styles = buildKatexMathStyles();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : null;
    if (JSON.stringify(current) !== JSON.stringify(styles)) {
      console.error(
        'assets/katex-math-styles.json is outdated; run scripts/vendor-katex-math-styles.cjs',
      );
      process.exitCode = 1;
    } else {
      console.log('assets/katex-math-styles.json is current');
    }
  } else {
    writeFileSync(OUT_FILE, `${JSON.stringify(styles, null, 2)}\n`, 'utf8');
    console.log('wrote assets/katex-math-styles.json');
  }
}

module.exports = { buildKatexMathStyles, OUT_FILE };
