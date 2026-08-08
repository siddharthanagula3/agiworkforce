#!/usr/bin/env node
/**
 * Prevention gate for the class of failure that took the authenticated API
 * down on 2026-08-07.
 *
 * `argon2` resolves its `.node` binary at RUNTIME through `node-gyp-build`,
 * which constructs the path from `process.arch`/`process.platform` rather than
 * requiring it statically. Next's file tracer follows static requires, so it
 * saw nothing to copy and shipped a serverless bundle with no binary in it.
 * Every route that transitively imported the hashing code — 98 of them —
 * answered HTTP 500:
 *
 *   Failed to load external module argon2-…: No native build was found for
 *   platform=linux arch=arm64 abi=137 node=24.18.0
 *
 * The build SUCCEEDED. Type checking, linting and 6,500 unit tests all passed.
 * Nothing in the pipeline could observe the difference, because the difference
 * only exists in the deployed bundle. That is what makes this worth a
 * dedicated check rather than a lesson learned.
 *
 * Two declarations are required and NEITHER is sufficient alone:
 *   - `serverExternalPackages` stops the bundler inlining the package;
 *   - `outputFileTracingIncludes` copies the binary the tracer cannot infer.
 *
 * This asserts both exist for every native package the web server actually
 * imports. It is static and takes milliseconds, so it runs in the guard chain
 * rather than waiting for a deploy to fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const WEB = path.join(root, 'apps/web');
const CONFIG = path.join(WEB, 'next.config.ts');
const STORE = path.join(root, 'node_modules/.pnpm');

/** Directories whose code runs on the server and can pull in a native module. */
const SERVER_DIRS = ['app', 'lib', 'features', 'shared'];
const SERVER_FILES = ['proxy.ts', 'instrumentation.ts'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);

const errors = [];
const notes = [];

/** Every package in the pnpm store that ships a compiled binary. */
function nativePackages() {
  const found = new Set();
  if (!fs.existsSync(STORE)) return found;
  for (const entry of fs.readdirSync(STORE)) {
    const base = path.join(STORE, entry, 'node_modules');
    if (!fs.existsSync(base)) continue;
    let top;
    try {
      top = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const pkg of top) {
      const names = [];
      if (pkg.startsWith('@')) {
        try {
          for (const sub of fs.readdirSync(path.join(base, pkg))) names.push(`${pkg}/${sub}`);
        } catch {
          continue;
        }
      } else {
        names.push(pkg);
      }
      for (const name of names) {
        const dir = path.join(base, name);
        try {
          if (
            fs.existsSync(path.join(dir, 'prebuilds')) ||
            fs.existsSync(path.join(dir, 'build', 'Release'))
          ) {
            found.add(name);
          }
        } catch {
          /* unreadable entry in the store is not this check's business */
        }
      }
    }
  }
  return found;
}

function* sourceFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

/** Packages from `candidates` that web server source imports directly. */
function importedNativePackages(candidates) {
  const imported = new Map();
  const files = [
    ...SERVER_DIRS.flatMap((d) => [...sourceFiles(path.join(WEB, d))]),
    ...SERVER_FILES.map((f) => path.join(WEB, f)).filter((f) => fs.existsSync(f)),
  ];
  for (const file of files) {
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const pkg of candidates) {
      // Static import, dynamic import, or require of the package root or a
      // subpath. A lazy `await import()` still needs the binary present.
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:from|import|require)\\s*\\(?\\s*['"]${escaped}(?:/[^'"]*)?['"]`);
      if (re.test(src)) {
        if (!imported.has(pkg)) imported.set(pkg, []);
        imported.get(pkg).push(path.relative(root, file));
      }
    }
  }
  return imported;
}

/**
 * Strip comments before matching.
 *
 * Found by testing this check against the real outage: with
 * `outputFileTracingIncludes` DELETED from the config, the check still passed,
 * because the identifier appears in the doc comment above it and `argon2` sat
 * within the search window. The guard was matching prose. A check that passes
 * for the wrong reason is worse than no check, because it is trusted.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const config = fs.existsSync(CONFIG) ? stripComments(fs.readFileSync(CONFIG, 'utf8')) : '';
if (!config) {
  errors.push(`Missing ${path.relative(root, CONFIG)} — cannot verify native-module tracing.`);
}

const candidates = nativePackages();
const imported = importedNativePackages(candidates);

for (const [pkg, files] of [...imported].sort(([a], [b]) => a.localeCompare(b))) {
  const declaredExternal = new RegExp(
    `serverExternalPackages[\\s\\S]{0,400}?['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
  ).test(config);
  const declaredTraced = new RegExp(
    `outputFileTracingIncludes[\\s\\S]{0,800}?${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  ).test(config);

  if (!declaredExternal || !declaredTraced) {
    const missing = [
      !declaredExternal ? 'serverExternalPackages' : null,
      !declaredTraced ? 'outputFileTracingIncludes' : null,
    ]
      .filter(Boolean)
      .join(' and ');
    errors.push(
      `'${pkg}' ships a native binary and is imported by the web server, but is missing from ` +
        `${missing} in apps/web/next.config.ts.\n` +
        `    Imported by: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` (+${files.length - 3} more)` : ''}\n` +
        `    Both declarations are required. Either alone still ships a package that cannot ` +
        `resolve its binary at runtime, which builds green and 500s in production.`,
    );
  } else {
    notes.push(`${pkg}: declared external and traced (${files.length} importing file(s))`);
  }
}

if (errors.length > 0) {
  console.error('Native-module tracing check failed:\n');
  for (const error of errors) console.error(`- ${error}\n`);
  process.exit(1);
}

console.log(
  `Native-module tracing check passed (${candidates.size} native package(s) in the store, ` +
    `${imported.size} imported by the web server).`,
);
for (const note of notes) console.log(`  ${note}`);
