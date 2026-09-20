#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  fixedEndpointNames,
  importedEndpointNames,
  moduleScopeFunctions,
  outboundFetchCalls,
  sourceFilesUnder,
  unvettedUrlModules,
} from './lib/url-fetch-egress.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

/** The one module allowed to reach the network itself. */
const SHARED = 'apps/web/lib/url-fetch/guarded-fetch.ts';

/**
 * The tool surfaces that fetch a URL nobody here chose: `url_fetch` takes the
 * model's word for it, `web_search` takes a search vendor's.
 */
const TOOL_SURFACES = ['apps/web/lib/url-fetch', 'apps/web/lib/web-search'];

const SEARCH_ROOTS = ['apps/web/lib', 'apps/web/app'];
const MCP_POLICY_MARKER = 'McpEgressPolicy';
const SHARED_CALLS = ['guardedFetch(', 'credentialedFetch('];
const GUARD = 'assertResolvedPublicHostname';
const SHARED_CALL = 'guardedFetch(';
const SAFE_REDIRECT_MODES = ['manual', 'error'];

const failures = [];
let callCount = 0;

function relative(file) {
  return path.relative(scanRoot, file).split(path.sep).join('/');
}

function inToolSurface(rel) {
  return TOOL_SURFACES.some((surface) => rel.startsWith(`${surface}/`));
}

for (const surface of TOOL_SURFACES) {
  if (!fs.existsSync(path.join(scanRoot, surface))) {
    failures.push(`${surface} is missing, so nothing proves its outbound calls are bounded`);
  }
}
if (!fs.existsSync(path.join(scanRoot, SHARED))) {
  failures.push(`${SHARED} is missing, so there is no one place that vets a hop`);
}

const scoped = unvettedUrlModules(
  SEARCH_ROOTS.map((root) => path.join(scanRoot, root)).filter((dir) => fs.existsSync(dir)),
  GUARD,
  TOOL_SURFACES.map((surface) => path.join(scanRoot, surface)),
);

for (const file of scoped) {
  const rel = relative(file);
  if (rel === SHARED) continue;
  const source = fs.readFileSync(file, 'utf8');
  const functions = moduleScopeFunctions(source);
  const fixed = fixedEndpointNames(source, importedEndpointNames(source, file, scanRoot));

  for (const call of outboundFetchCalls(source)) {
    if (call.target && fixed.includes(call.target)) continue;
    callCount += 1;
    const holder = functions.find((fn) => call.index >= fn.start && call.index < fn.end);
    const site = `${rel}::${holder ? holder.name : '<module scope>'}`;

    if (inToolSurface(rel)) {
      failures.push(
        `${site} calls ${call.callee}() directly. On this surface the target URL is chosen by a ` +
          `model or a search vendor, so every fetch goes through guardedFetch in ${SHARED}, ` +
          `which vets scheme, credentials and resolved host at the top of every hop.`,
      );
      continue;
    }
    const enclosing = holder ? source.slice(holder.start, holder.end) : source;
    // A host the fixed allowlist vouches for is not a host the caller chose.
    if (enclosing.includes('validateEgressUrl(')) continue;
    if (!SAFE_REDIRECT_MODES.includes(call.redirect ?? '')) {
      failures.push(
        `${site} fetches ${call.callee}() with redirect '${call.redirect ?? 'follow (unset)'}', ` +
          `so the client follows hops this process never vets. A redirect to an IP literal skips ` +
          `the DNS pin entirely, which is how a metadata endpoint is reached. Use guardedFetch ` +
          `from ${SHARED}, or redirect: 'manual' with ${GUARD} at the top of every hop.`,
      );
      continue;
    }
    if (!enclosing.includes(GUARD)) {
      failures.push(
        `${site} fetches ${call.callee}() without calling ${GUARD} in the same function, so the ` +
          `target it reaches is not the target the policy vetted`,
      );
    }
  }
}

for (const surface of TOOL_SURFACES) {
  const dir = path.join(scanRoot, surface);
  if (!fs.existsSync(dir)) continue;
  const uses = sourceFilesUnder(dir).some((file) =>
    fs.readFileSync(file, 'utf8').includes(SHARED_CALL),
  );
  if (!uses) {
    failures.push(`${surface} never calls guardedFetch, so the shared vetting is not in its path`);
  }
}

// An MCP dial carries the user's credential to a server the user named, so the
// hops are this process's to follow, never the SDK's.
for (const file of scoped) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(MCP_POLICY_MARKER)) continue;
  if (SHARED_CALLS.some((call) => source.includes(call))) continue;
  failures.push(
    `${relative(file)} hands the MCP client a fetch of its own, so the client follows redirects ` +
      `this process never vets and carries the credential wherever they lead. Route it through ` +
      `credentialedFetch with redirects: 'same-origin'.`,
  );
}

if (scoped.length === 0) {
  console.error('check-url-fetch-egress: found no module that fetches an unvetted URL');
  process.exit(1);
}

if (failures.length === 0) {
  console.log(
    `check-url-fetch-egress: ${scoped.length} module(s) reach an unvetted URL, ${callCount} ` +
      `direct call(s) outside ${SHARED}, all vetting every hop.`,
  );
  process.exit(0);
}

console.error('Outbound fetches that reach a host this process never vetted:\n');
for (const failure of failures) console.error(`  - ${failure}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
