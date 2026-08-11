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
    // packages/ui is scanned under BOTH desktop and web: a shared component
    // must resolve against every surface that renders it, and the two surfaces
    // load different stylesheets. A --chat-surface typo (the family is
    // --chat-surface-base/-elevated/-overlay/-hover) shipped here unnoticed.
    source: ['apps/desktop/src', 'packages/ui'],
    stylesheets: ['apps/desktop/src/styles/globals.css', 'packages/ui/design-tokens/src/chat.css'],
  },
  {
    name: 'web',
    // Whole surface, not just features/: the first pass scanned features/ only,
    // which left app/ and shared/ unguarded — and two live `1px solid
    // var(--border)` borders were silently dropped there (--border is an HSL
    // triplet, valid only as hsl(var(--border))).
    source: ['apps/web', 'packages/ui'],
    stylesheets: ['apps/web/app/globals.css', 'packages/ui/design-tokens/src/chat.css'],
  },
  {
    // Chrome is the odd surface: almost none of its CSS is a stylesheet. The
    // side panel builds its token block at runtime from `agiExtensionCssVars`
    // and adopts it via Constructable Stylesheets (CSP forbids <style>), so the
    // TS token source IS the stylesheet here. Listing it keeps the 863 var()
    // references in side_panel.ts/options.ts guarded instead of unverifiable.
    name: 'chrome',
    source: 'apps/extension/src',
    stylesheets: [
      'apps/extension/src/side_panel.css',
      'apps/extension/src/options.css',
      'packages/ui/design-tokens/src/index.ts',
    ],
  },
  {
    // VS Code's webview has no stylesheet either: getWebviewContent emits an
    // inline <style nonce> block, so that TS file IS the stylesheet. Its own
    // --agi-vscode-* / --bg-* / --text-* families are defined there; the
    // --vscode-* family is injected by the host and is in EXTERNALLY_PROVIDED.
    name: 'vscode',
    source: 'apps/extension-vscode/src',
    stylesheets: [
      'apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts',
      // `${cssVarsToString(agiVsCodeCssVars)}` interpolated into that :root
      // block — the --agi-vscode-* values live here, exactly as Chrome's do.
      'packages/ui/design-tokens/src/index.ts',
    ],
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
    // The optional quote before `:` lets one regex read both a CSS declaration
    // (`--x: value;`) and a TS token-map entry (`'--x': value,`). Chrome's
    // tokens only exist in the latter form.
    // Value capture is newline-bounded. Unbounded `[^;}]+` was greedy across
    // lines in a TS token map (entries end in `,`, not `;`), so one match
    // swallowed the next several tokens and they read as undeclared.
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)["'`]?\s*:\s*([^;}\n]+)/g)) {
      declared.add(m[1]);
      if (HSL_TRIPLET_RE.test(m[2])) hslTriplets.add(m[1]);
    }
  }
  return { declared, hslTriplets };
}

/**
 * Overlays that render through a Portal are appended to <body>, so they are
 * siblings in one stacking context and their z-index values are compared against
 * each other — not against the subtree they were written in. A raw literal there
 * is therefore a silent claim about every other overlay in the app, and it is
 * wrong as soon as one of them moves: `z-50` on Select, DropdownMenu, ContextMenu,
 * Menubar, HoverCard and Tooltip put them all underneath a Dialog after Dialog
 * moved to `--z-modal` (300), so the Select inside GlobalSearchDialog's
 * DialogContent rendered behind the dialog that owned it.
 *
 * These files must express their layer as `z-[var(--z-<layer>,<fallback>)]`, in a
 * class or in an inline style. The list is the set of primitives that are on the
 * shared scale today, not every portalled component: it exists to stop these
 * regressing to a literal. Sheet.tsx and Drawer.tsx are deliberately absent —
 * they still carry `z-50` and have no render path in any app, so nothing has
 * established where they belong (see ExecutionPlan #99 notes). NavigationMenu's
 * `z-[1]` indicator and Calendar's `z-20` nav are local to their own stacking
 * context and are fine. A missing file is an error, so a rename cannot quietly
 * drop a file from the gate.
 */
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

/**
 * Both ways a component can hardcode a layer:
 *  - a Tailwind utility carrying a literal — `z-50`, `z-[100]`, `-z-10`;
 *  - an inline style — `style={{ zIndex: 50 }}`, `zIndex: '50'`.
 * The second form bypassed the class-only version of this rule, and it is the
 * shape the untouched offenders use (GalleryClient.tsx, FilePreviewModal.tsx).
 * `zIndex: 'var(--z-modal, 300)'` is allowed, same as the class form.
 */
const RAW_Z_INDEX_PATTERNS = [
  /(?<![\w-])-?z-(?:\d+|\[(?!var\()[^\]]*\])/g,
  /\bzIndex\s*:\s*(?!['"`]?\s*var\()['"`]?-?\d+/g,
];

/** Where the `--z-*` layers referenced by those classes are declared. */
const Z_SCALE_CSS = 'apps/web/app/globals.css';

/** Blanks comments while preserving line numbers, so prose about `z-50` is not a hit. */
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

/**
 * Tailwind v4 scans raw source text, including comments. A prose placeholder
 * that still looks like an arbitrary utility is therefore executable input to
 * the CSS compiler. For example, a comment containing a z-index utility with
 * an angle-bracket placeholder produced `var(--z-<layer>,…)`, made globals.css
 * unparsable, and returned HTTP 500 before the sign-in screen rendered.
 */
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

checkPortalOverlays();
checkInvalidTailwindArbitraryCandidates();

for (const surface of SURFACES) {
  const { declared, hslTriplets } = declaredTokens(surface.stylesheets);
  for (const token of nextFontTokens()) declared.add(token);
  if (declared.size === 0) {
    errors.push(`${surface.name}: no tokens found in ${surface.stylesheets.join(', ')}`);
    continue;
  }

  for (const file of [surface.source].flat().flatMap((dir) => walk(dir))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = source.split('\n');

    // Tokens this file sets imperatively at runtime (style.setProperty) are
    // defined for its own use even though no stylesheet declares them. The MCP
    // app host, for example, emits a sandboxed document and injects its own
    // theme tokens into it. Skipping these keeps the gate honest — a gate that
    // reports correct code gets switched off.
    // Two ways a file can define a token for its own use without a stylesheet:
    // `element.style.setProperty('--x', …)`, and a React inline style object
    // (`style={{ '--x': value }}`) — the latter is how shadcn's sidebar sizes
    // itself and how global-error.tsx themes the crash page, which replaces the
    // root layout and therefore loads no stylesheet at all.
    const runtimeDefined = new Set([
      ...[...source.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9-]+)/g)].map((m) => m[1]),
      ...[...source.matchAll(/["'`](--[a-zA-Z0-9-]+)["'`]\s*:/g)].map((m) => m[1]),
    ]);

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
    `${SURFACES.length} surfaces, all resolvable; ${PORTAL_OVERLAYS.length} portal overlays ` +
    `free of raw z-index literals in classes and inline styles).`,
);
