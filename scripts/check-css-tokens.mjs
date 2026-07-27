#!/usr/bin/env node
/**
 * CSS custom-property gate.
 *
 * A `var(--thing)` that is never defined does not throw, does not fail a test,
 * and does not show up in typecheck. The declaration is simply dropped and the
 * element renders unstyled — inheriting whatever the parent had. That is
 * invisible in code review and invisible in CI, and it is only caught by a human
 * looking at the screen.
 *
 * It shipped exactly that way: apps/desktop's account/plan popover styled itself
 * with `--text-1`, `--text-2`, `--text-3`, `--bg-soft` and `--mono`, none of
 * which are defined anywhere in the repo. Dividers never drew, hover produced no
 * feedback, and text colour fell back to inherited — directly beside a sidebar
 * using the correct `--chat-*` family.
 *
 * There is a second, subtler failure this catches. Some tokens hold a raw HSL
 * channel triplet (`--border: 214.3 31.8% 91.4%`) and are only valid wrapped in
 * `hsl(...)`. Using one bare — `1px solid var(--border)` — expands to an invalid
 * shorthand and the whole declaration is dropped.
 *
 * Usage: node scripts/check-css-tokens.mjs
 * Exit:  0 = every referenced token resolves · 1 = at least one dangling token
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

/**
 * Each surface declares the stylesheets it actually loads at runtime. A token is
 * only "defined" for that surface if one of these files declares it — which is
 * the point: a token defined in apps/web does nothing for apps/desktop.
 */
const SURFACES = [
  {
    name: 'desktop',
    source: 'apps/desktop/src',
    stylesheets: ['apps/desktop/src/styles/globals.css', 'packages/ui/design-tokens/src/chat.css'],
  },
  {
    name: 'web',
    source: 'apps/web/features',
    stylesheets: ['apps/web/app/globals.css', 'packages/ui/design-tokens/src/chat.css'],
  },
];

/**
 * Properties supplied by the browser, a framework, or set imperatively at
 * runtime rather than declared in a stylesheet.
 */
const EXTERNALLY_PROVIDED = [
  /^--vscode-/, // VS Code injects its theme tokens into the webview
  /^--tw-/, // Tailwind internals
  /^--radix-/, // Radix UI positioning
  /^--shiki-/, // syntax highlighter
];

/** Tokens holding a bare HSL channel triplet — only valid inside hsl(). */
const HSL_TRIPLET_RE = /^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*$/;

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'src-tauri', '__tests__'].includes(entry.name))
        continue;
      walk(rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Font variables declared through next/font (`variable: '--font-x'`) are injected
 * onto the document element at runtime, so they are defined even though no
 * stylesheet declares them.
 */
function nextFontTokens() {
  const found = new Set();
  for (const rel of ['apps/web/app/layout.tsx']) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/variable:\s*['\"`](--[a-zA-Z0-9-]+)/g)) found.add(m[1]);
  }
  return found;
}

/** Custom properties DECLARED by a stylesheet, plus which hold HSL triplets. */
function declaredTokens(files) {
  const declared = new Set();
  const hslTriplets = new Set();
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    const css = fs.readFileSync(abs, 'utf8');
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g)) {
      declared.add(m[1]);
      if (HSL_TRIPLET_RE.test(m[2])) hslTriplets.add(m[1]);
    }
  }
  return { declared, hslTriplets };
}

const errors = [];
let referenced = 0;

for (const surface of SURFACES) {
  const { declared, hslTriplets } = declaredTokens(surface.stylesheets);
  for (const token of nextFontTokens()) declared.add(token);
  if (declared.size === 0) {
    errors.push(`${surface.name}: no tokens found in ${surface.stylesheets.join(', ')}`);
    continue;
  }

  for (const file of walk(surface.source)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = source.split('\n');

    // Tokens this file sets imperatively at runtime (style.setProperty) are
    // defined for its own use even though no stylesheet declares them. The MCP
    // app host, for example, emits a sandboxed document and injects its own
    // theme tokens into it. Skipping these keeps the gate honest — a gate that
    // reports correct code gets switched off.
    const runtimeDefined = new Set(
      [...source.matchAll(/setProperty\(\s*[\"'`](--[a-zA-Z0-9-]+)/g)].map((m) => m[1]),
    );

    lines.forEach((line, index) => {
      for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g)) {
        const token = m[1];
        if (EXTERNALLY_PROVIDED.some((re) => re.test(token))) continue;
        if (runtimeDefined.has(token)) continue;
        // A var() with a fallback still renders something; not a silent failure.
        if (m[0].includes(',')) continue;
        referenced += 1;

        if (!declared.has(token)) {
          errors.push(
            `${file}:${index + 1} references ${token}, which no stylesheet loaded by ` +
              `${surface.name} defines. The declaration is dropped and the element renders unstyled.`,
          );
          continue;
        }

        // Bare use of an HSL-triplet token outside hsl() is an invalid shorthand.
        const usedInsideHsl = new RegExp(`hsl\\(\\s*var\\(\\s*${token}\\b`).test(line);
        if (hslTriplets.has(token) && !usedInsideHsl) {
          errors.push(
            `${file}:${index + 1} uses ${token} bare, but it holds a raw HSL channel triplet and is ` +
              `only valid as hsl(var(${token})). Used bare the whole declaration is dropped.`,
          );
        }
      }
    });
  }
}

if (errors.length > 0) {
  console.error('CSS token check FAILED:\n');
  for (const e of errors) console.error(`- ${e}`);
  console.error(
    `\nDefine the token in the surface's stylesheet, or use one that exists. Desktop and web both\n` +
      `load packages/ui/design-tokens/src/chat.css, so the --chat-* family is always available.`,
  );
  process.exit(1);
}

console.log(
  `CSS token check passed (${referenced} custom-property references across ` +
    `${SURFACES.length} surfaces, all resolvable).`,
);
