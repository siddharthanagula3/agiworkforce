#!/usr/bin/env node
/**
 * Emits the TAURI_CONFIG merge JSON used by `pnpm run test:e2e:build`.
 *
 * Two things have to be true before a WDIO spec can drive real product UI, and
 * both were verified against the running binary on 2026-08-01 by reading the
 * WebKit CSP violation report and the isolation handshake directly:
 *
 * 1. ISOLATED IDENTITY AND TEST BRIDGE. `tauri.conf.wdio.json` swaps the bundle
 *    identifier to com.agiworkforce.desktop.wdio so a native run never opens
 *    or mutates the user's installed-app database, and so
 *    OsDatabaseKeyStore::harness_key can accept AGI_DESKTOP_WDIO_DATABASE_KEY
 *    instead of prompting the Keychain. It also enables `withGlobalTauri` only
 *    in the harness build because @wdio/tauri-plugin reaches the native invoke
 *    bridge through `window.__TAURI__.core.invoke`.
 *
 * 2. AN ISOLATION-COMPATIBLE frame-src. The app runs Tauri's `isolation`
 *    pattern: every invoke() is relayed through a hidden iframe served from a
 *    per-build `isolation-<uuid>://localhost` origin, and the relay only starts
 *    forwarding after that iframe posts `__TAURI_ISOLATION_READY__` back to the
 *    main frame. Tauri appends the generated isolation schema to `default-src`
 *    ONLY (tauri-2.11.1 src/manager/mod.rs, `Pattern::Isolation` branch). An
 *    explicit `frame-src` in app.security.csp therefore takes precedence and
 *    blocks the iframe — WebKit reports
 *      blockedURI=isolation-<uuid>://localhost violatedDirective=frame-src
 *    — the handshake never arrives, and EVERY invoke() promise hangs forever
 *    with no resolve and no reject. The schema is a fresh uuid per build, so no
 *    static frame-src string can ever name it.
 *
 * The product config currently has no explicit `frame-src`. As a regression
 * defense, this script detects one and rewrites the harness CSP by deleting
 * `frame-src` and folding its sources into `default-src`, which Tauri then
 * extends with the isolation schema. It reads the product config at build time,
 * so it tracks the real policy instead of duplicating it.
 *
 * This fallback is a harness compensation, not a product fix. If the shipped
 * configuration regresses, `pnpm run test:e2e` prints a warning until the
 * product CSP is corrected.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROD_CONFIG_PATH = resolve(HERE, '../src-tauri/tauri.conf.json');
export const WDIO_CONFIG_PATH = resolve(HERE, '../src-tauri/tauri.conf.wdio.json');

/** Split a CSP policy string into ordered `[directive, sources[]]` pairs. */
export function parseCsp(policy) {
  return policy
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [directive, ...sources] = part.split(/\s+/);
      return [directive, sources];
    });
}

export function serializeCsp(entries) {
  return entries
    .map(([directive, sources]) =>
      sources.length ? `${directive} ${sources.join(' ')}` : directive,
    )
    .join('; ');
}

/**
 * True when `policy` pins `frame-src`, which shadows the `default-src` entry
 * Tauri extends with the isolation schema and so deadlocks every invoke().
 */
export function blocksIsolationFrame(policy) {
  return parseCsp(policy).some(([directive]) => directive === 'frame-src');
}

/**
 * Move every `frame-src` source into `default-src` and drop `frame-src`.
 *
 * The effective frame allowlist is unchanged (the same sources still apply to
 * frames, via the default-src fallback) plus the isolation schema Tauri adds at
 * runtime. Directives the policy sets explicitly are untouched; the only other
 * directives that inherit the widened `default-src` are ones this policy never
 * uses (child-src, manifest-src, prefetch-src).
 */
export function foldFrameSrcIntoDefaultSrc(policy) {
  const entries = parseCsp(policy);
  const frameSrc = entries.find(([directive]) => directive === 'frame-src');
  if (!frameSrc) return policy;

  const kept = entries.filter(([directive]) => directive !== 'frame-src');
  const defaultSrc = kept.find(([directive]) => directive === 'default-src');
  if (!defaultSrc) {
    throw new Error(
      `${PROD_CONFIG_PATH}: app.security.csp declares frame-src but no default-src, so the ` +
        'isolation iframe has no directive left to allow it. Fix the product CSP.',
    );
  }

  for (const source of frameSrc[1]) {
    if (!defaultSrc[1].includes(source)) defaultSrc[1].push(source);
  }
  return serializeCsp(kept);
}

export function buildMergeConfig() {
  const prod = JSON.parse(readFileSync(PROD_CONFIG_PATH, 'utf8'));
  const wdio = JSON.parse(readFileSync(WDIO_CONFIG_PATH, 'utf8'));

  if (wdio?.app?.withGlobalTauri !== true) {
    throw new Error(
      `${WDIO_CONFIG_PATH}: expected app.withGlobalTauri=true because ` +
        '@wdio/tauri-plugin requires window.__TAURI__.core.invoke.',
    );
  }

  const csp = prod?.app?.security?.csp;
  if (typeof csp !== 'string' || csp.length === 0) {
    throw new Error(`${PROD_CONFIG_PATH}: expected app.security.csp to be a non-empty string.`);
  }

  const merged = { ...wdio };
  const isolationPattern = prod?.app?.security?.pattern?.use === 'isolation';
  if (isolationPattern && blocksIsolationFrame(csp)) {
    merged.app = {
      ...(merged.app ?? {}),
      security: {
        ...(merged.app?.security ?? {}),
        csp: foldFrameSrcIntoDefaultSrc(csp),
      },
    };
  }
  return merged;
}

// `$(node wdio/tauri-config.mjs)` in test:e2e:build consumes stdout, so keep
// stdout to the JSON alone and send the advisory to stderr.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const merged = buildMergeConfig();
  if (merged.app?.security?.csp) {
    process.stderr.write(
      'WARNING: apps/desktop/src-tauri/tauri.conf.json pins `frame-src` while the isolation\n' +
        '         pattern is enabled. In a packaged build that blocks the isolation iframe and\n' +
        '         every Tauri invoke() hangs forever. The E2E build folds frame-src into\n' +
        '         default-src so specs can run; the SHIPPED app is still broken until the\n' +
        '         product CSP is fixed the same way.\n',
    );
  }
  process.stdout.write(JSON.stringify(merged));
}
