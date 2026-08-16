#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROD_CONFIG_PATH = resolve(HERE, '../src-tauri/tauri.conf.json');
export const WDIO_CONFIG_PATH = resolve(HERE, '../src-tauri/tauri.conf.wdio.json');

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

export function blocksIsolationFrame(policy) {
  return parseCsp(policy).some(([directive]) => directive === 'frame-src');
}

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
