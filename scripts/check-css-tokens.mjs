#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const SURFACES = [
  {
    name: 'desktop',
    source: ['apps/desktop/src', 'packages/ui'],
    stylesheets: ['apps/desktop/src/styles/globals.css', 'packages/ui/design-tokens/src/chat.css'],
  },
  {
    name: 'web',
    source: ['apps/web', 'packages/ui'],
    stylesheets: [
      'apps/web/app/globals.css',
      'packages/ui/design-tokens/src/chat.css',
      'packages/ui/design-tokens/src/foundation.css',
    ],
  },
  {
    name: 'chrome',
    source: 'apps/extension/src',
    stylesheets: [
      'apps/extension/src/side_panel.css',
      'apps/extension/src/options.css',
      'packages/ui/design-tokens/src/index.ts',
    ],
  },
  {
    name: 'vscode',
    source: 'apps/extension-vscode/src',
    stylesheets: [
      'apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts',
      'packages/ui/design-tokens/src/index.ts',
    ],
  },
];

const EXTERNALLY_PROVIDED = [
  /^--vscode-/, // VS Code injects its theme tokens into the webview
  /^--tw-/, // Tailwind internals
  /^--radix-/, // Radix UI positioning
  /^--shiki-/, // syntax highlighter
];

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
    } else if (
      /\.(tsx?|css)$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name)
    ) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Tailwind's source detector is intentionally broader than the runtime token
 * walker above: test files, JavaScript modules, and MDX can all contain class
 * candidates even though they are not useful inputs to the custom-property
 * reference check. Keep those files in the arbitrary-utility safety scan.
 */
function walkTailwindSources(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'src-tauri'].includes(entry.name)) continue;
      walkTailwindSources(rel, out);
    } else if (/\.(?:[cm]?[jt]sx?|mdx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

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

function declaredTokens(files) {
  const declared = new Set();
  const hslTriplets = new Set();
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    const css = fs.readFileSync(abs, 'utf8');
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)["'`]?\s*:\s*([^;}\n]+)/g)) {
      declared.add(m[1]);
      if (HSL_TRIPLET_RE.test(m[2])) hslTriplets.add(m[1]);
    }
  }
  return { declared, hslTriplets };
}

const PORTAL_OVERLAYS = [
  'packages/ui/ui/src/primitives/AlertDialog.tsx',
  'packages/ui/ui/src/primitives/ContextMenu.tsx',
  'packages/ui/ui/src/primitives/Dialog.tsx',
  'packages/ui/ui/src/primitives/DropdownMenu.tsx',
  'packages/ui/ui/src/primitives/HoverCard.tsx',
  'packages/ui/ui/src/primitives/Menubar.tsx',
  'packages/ui/ui/src/primitives/Popover.tsx',
  'packages/ui/ui/src/primitives/Select.tsx',
  'packages/ui/ui/src/primitives/Toast.tsx',
  'packages/ui/ui/src/primitives/Tooltip.tsx',
];

const RAW_Z_INDEX_PATTERNS = [
  /(?<![\w-])-?z-(?:\d+|\[(?!var\()[^\]]*\])/g,
  /\bzIndex\s*:\s*(?!['"`]?\s*var\()['"`]?-?\d+/g,
];

const Z_SCALE_CSS = 'apps/web/app/globals.css';

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - lead.length));
}

function checkPortalOverlays() {
  for (const file of PORTAL_OVERLAYS) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) {
      errors.push(
        `${file} is listed as a portal overlay but does not exist — update PORTAL_OVERLAYS.`,
      );
      continue;
    }
    stripComments(fs.readFileSync(abs, 'utf8'))
      .split('\n')
      .forEach((line, index) => {
        for (const re of RAW_Z_INDEX_PATTERNS) {
          for (const m of line.matchAll(re)) {
            errors.push(
              `${file}:${index + 1} sets a raw z-index (\`${m[0].trim()}\`). This overlay is ` +
                `portalled to <body>, so its layer is only meaningful relative to the others: use ` +
                `var(--z-<layer>, <fallback>) from the scale in ${Z_SCALE_CSS}.`,
            );
          }
        }
      });
  }
}

const INVALID_TAILWIND_ARBITRARY_CANDIDATE =
  /(?:[!@a-z0-9_:/.-]+)-\[[^\]\n]*(?:<[^>\n]+>|…)[^\]\n]*\]/gi;

function checkInvalidTailwindArbitraryCandidates() {
  const files = new Set([
    ...walkTailwindSources('apps/web'),
    ...walkTailwindSources('packages/ui'),
  ]);
  for (const file of files) {
    fs.readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const match of line.matchAll(INVALID_TAILWIND_ARBITRARY_CANDIDATE)) {
          errors.push(
            `${file}:${index + 1} contains an invalid Tailwind arbitrary-utility candidate ` +
              `(${match[0]}). Tailwind scans comments too; describe the pattern in prose ` +
              `without bracket-utility syntax or use a real CSS value.`,
          );
        }
      });
  }
}

const errors = [];
let referenced = 0;

function checkSelfReferentialTokens() {
  for (const surface of SURFACES) {
    for (const sheet of surface.stylesheets) {
      if (!sheet.endsWith('.css')) continue;
      const abs = path.join(root, sheet);
      if (!fs.existsSync(abs)) continue;
      const lines = fs.readFileSync(abs, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*var\(\s*(--[a-zA-Z0-9-]+)/);
        if (m && m[1] === m[2]) {
          errors.push(
            `${sheet}:${index + 1} declares ${m[1]} as var(${m[1]}). A custom property that ` +
              `references itself is invalid at computed-value time and silently falls back.`,
          );
        }
      });
    }
  }
}

checkPortalOverlays();
checkInvalidTailwindArbitraryCandidates();
checkSelfReferentialTokens();

for (const surface of SURFACES) {
  const { declared, hslTriplets } = declaredTokens(surface.stylesheets);
  for (const token of nextFontTokens()) declared.add(token);
  if (declared.size === 0) {
    errors.push(`${surface.name}: no tokens found in ${surface.stylesheets.join(', ')}`);
    continue;
  }

  const surfaceFiles = [surface.source].flat().flatMap((dir) => walk(dir));

  const runtimeProvided = new Set();
  for (const file of surfaceFiles) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const m of source.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9-]+)/g))
      runtimeProvided.add(m[1]);
    for (const m of source.matchAll(/["'`](--[a-zA-Z0-9-]+)["'`]\s*:/g)) runtimeProvided.add(m[1]);
  }

  for (const file of surfaceFiles) {
    const raw = fs.readFileSync(path.join(root, file), 'utf8');
    // Blank out comment bodies while preserving line numbering, so a token
    // named in prose is not read as a reference.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
    const lines = source.split('\n');

    const runtimeDefined = new Set([
      ...runtimeProvided,
      ...[...source.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]),
    ]);

    lines.forEach((line, index) => {
      for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g)) {
        const token = m[1];
        if (EXTERNALLY_PROVIDED.some((re) => re.test(token))) continue;
        if (runtimeDefined.has(token)) continue;
        if (m[0].includes(',')) continue;
        referenced += 1;

        if (!declared.has(token)) {
          errors.push(
            `${file}:${index + 1} references ${token}, which no stylesheet loaded by ` +
              `${surface.name} defines. The declaration is dropped and the element renders unstyled.`,
          );
          continue;
        }

        const usedInsideHsl = new RegExp(`hsl\\(\\s*var\\(\\s*${token}\\b`).test(line);
        const aliasedIntoAnotherToken = /^\s*--[a-zA-Z0-9-]+\s*:/.test(line);
        if (hslTriplets.has(token) && !usedInsideHsl && !aliasedIntoAnotherToken) {
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
    `${SURFACES.length} surfaces, all resolvable; ${PORTAL_OVERLAYS.length} portal overlays ` +
    `free of raw z-index literals in classes and inline styles).`,
);
