#!/usr/bin/env node

// A server-sent event stream is framed one way: fields on lines, a blank line
// ending the frame, comments skipped, CR, LF and CRLF all line breaks, and a
// frame too large to hold refused. @agiworkforce/client-runtime reads it that
// way (ServerSentEventDecoder, readServerSentEvents). A client that splits the
// body on its own gets one of those rules wrong on a stream the others handle,
// so every client module that frames SSE by hand is either reading through the
// shared reader or recorded here with its owner, and the record only shrinks.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SHARED_READER = 'packages/client/client-runtime/src/sse.ts';
export const SHARED_READER_SYMBOLS = Object.freeze([
  'ServerSentEventDecoder',
  'readServerSentEvents',
]);

export const CLIENT_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/desktop/src',
  'apps/desktop/electron',
  'packages/ui',
]);

export const SERVER_MODULES = Object.freeze({
  'apps/web/features/models/lib/promotional-chat-stream.ts':
    'Validates a provider stream on the server before it is relayed, and treats a data-less error event as a failure the shared decoder does not dispatch.',
});

const SERVER_PREFIXES = Object.freeze([
  'apps/web/app/api/',
  'apps/web/lib/services/',
  'apps/web/lib/e2b/',
  'apps/web/lib/workflows/',
  'apps/web/lib/server/',
]);

const FIX =
  'read the stream with readServerSentEvents or ServerSentEventDecoder from @agiworkforce/client-runtime';

export const PENDING = Object.freeze({});

const SOURCE_FILE = /\.(?:tsx?|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?tsx?$/;
const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|__tests__$|__mocks__$|__fixtures__$|e2e$)/;
const DATA_LINE_TEST = /startsWith\(\s*['"`]data:/;
const BODY_FRAMING = /getReader\(\)|\.split\(\s*['"`]\\n/;
const FIELD_PARSING = /\bfield\s*[!=]==\s*['"`]data['"`]/;
const SHARED_IMPORT = /\b(?:ServerSentEventDecoder|readServerSentEvents)\b/;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sourceFiles(repoRoot, relativeRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(relativeRoot);
  return files;
}

export function framesServerSentEventsByHand(source) {
  if (SHARED_IMPORT.test(source)) return false;
  return (DATA_LINE_TEST.test(source) && BODY_FRAMING.test(source)) || FIELD_PARSING.test(source);
}

export function checkSseReaders(
  repoRoot = REPO_ROOT,
  { pending = PENDING, serverModules = SERVER_MODULES } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const shared = read(repoRoot, SHARED_READER);
  if (shared === null) {
    fail(`${SHARED_READER} is missing, so there is no shared reader to point clients at`);
    return failures;
  }
  for (const symbol of SHARED_READER_SYMBOLS) {
    if (!new RegExp(`export (?:async function\\*?|class|function) ${symbol}\\b`).test(shared)) {
      fail(`${SHARED_READER} no longer exports ${symbol}`);
    }
  }

  const pendingSeen = new Set();
  const serverSeen = new Set();
  for (const root of CLIENT_ROOTS) {
    for (const file of sourceFiles(repoRoot, root)) {
      if (SERVER_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
      const source = read(repoRoot, file);
      if (source === null || !framesServerSentEventsByHand(source)) continue;
      if (serverModules[file] !== undefined) {
        serverSeen.add(file);
      } else if (pending[file] !== undefined) {
        pendingSeen.add(file);
      } else {
        fail(
          `${file} frames a server-sent event stream by hand. Read it with readServerSentEvents or ServerSentEventDecoder from @agiworkforce/client-runtime.`,
        );
      }
    }
  }

  for (const [file, fix] of Object.entries(pending)) {
    if (typeof fix !== 'string' || fix.trim().length < 20)
      fail(`${file} is pending without an owner and a fix`);
    if (!pendingSeen.has(file)) {
      fail(
        `${file} no longer frames SSE by hand. Delete its pending entry; the list only shrinks.`,
      );
    }
  }
  for (const [file, why] of Object.entries(serverModules)) {
    if (typeof why !== 'string' || why.trim().length < 20)
      fail(`${file} is exempt without a reason`);
    if (!serverSeen.has(file)) {
      fail(`${file} no longer frames SSE by hand. Delete its exemption; the list only shrinks.`);
    }
  }
  return failures;
}

function main() {
  const failures = checkSseReaders();
  if (failures.length > 0) {
    console.error('SSE reader check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-sse-readers: clients read server-sent events through ${SHARED_READER}; ${Object.keys(PENDING).length} pending, ${Object.keys(SERVER_MODULES).length} server-side exemption(s).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
