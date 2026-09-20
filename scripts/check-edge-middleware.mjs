#!/usr/bin/env node

// The middleware is the only code every request passes through, so a response
// class it builds without the security headers is a hole in all of them. This
// enumerates each NextResponse the middleware can return, and each route
// prefix the shared route contract declares, rather than trusting a reading.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/edge-middleware.json';

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** Each function in the middleware that builds a response, with its body. */
export function responseBuilders(source) {
  const builders = [];
  const pattern = /\nfunction ([A-Za-z0-9_]+)\(([^)]*)\)[^{]*\{/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      const character = source[end];
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      end += 1;
    }
    const body = source.slice(start, end - 1);
    if (!/NextResponse\.(next|rewrite|redirect|json)\s*\(/.test(body)) continue;
    builders.push({ name: match[1], body });
  }
  return builders;
}

/** The literal route prefixes a `const NAME = [...] as const` declares. */
export function declaredPrefixes(source, name) {
  const match = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

/** The matcher patterns as regular expressions, the way Next.js applies them. */
export function matcherPatterns(source) {
  const config = /export const config = \{[\s\S]*?matcher: \[([\s\S]*?)\],\n\s*\};/.exec(source);
  if (config === null) return null;
  return [...config[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((entry) =>
    entry[1].replace(/\\\\/g, '\\'),
  );
}

export function matchesAnyPattern(pathname, patterns) {
  return patterns.some((pattern) => {
    try {
      return new RegExp(`^${pattern}$`).test(pathname);
    } catch {
      return false;
    }
  });
}

function checkResponseHeaders({ source, contract, errors }) {
  const builders = responseBuilders(source);
  if (builders.length === 0) {
    errors.push(
      `${contract.middleware}: no response builder was found, so nothing below was measured.`,
    );
    return 0;
  }
  const exempt = new Map((contract.headerExempt ?? []).map((entry) => [entry.name, entry]));
  for (const builder of builders) {
    const entry = exempt.get(builder.name);
    // On the response, not on the request headers it forwards: only the first
    // reaches the browser.
    const sets = new RegExp(`\\.headers\\.set\\(\\s*'${contract.requiredHeader}'`).test(
      builder.body,
    );
    if (sets) {
      if (entry) {
        errors.push(
          `${CONTRACT_PATH}: headerExempt still lists ${builder.name}, which now sets ` +
            `${contract.requiredHeader}. Delete the entry.`,
        );
      }
      continue;
    }
    if (!entry) {
      errors.push(
        `${contract.middleware}: ${builder.name} returns a response without setting ` +
          `${contract.requiredHeader}, so that class of response is served without it.`,
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: headerExempt entry ${builder.name} carries no reason.`);
    }
  }
  for (const name of exempt.keys()) {
    if (!builders.some((builder) => builder.name === name)) {
      errors.push(`${CONTRACT_PATH}: headerExempt names ${name}, which is not a response builder.`);
    }
  }
  return builders.length;
}

function checkRedirectTargets({ source, contract, errors }) {
  const parameters = contract.untrustedRedirectParameters ?? [];
  for (const builder of responseBuilders(source)) {
    if (!/NextResponse\.redirect\s*\(/.test(builder.body)) continue;
    for (const parameter of parameters) {
      const reads = new RegExp(
        `searchParams\\.get\\(\\s*'${parameter}'|nextUrl\\.searchParams\\[[^\\]]*${parameter}`,
      );
      if (reads.test(builder.body)) {
        errors.push(
          `${contract.middleware}: ${builder.name} builds a redirect out of the "${parameter}" ` +
            'query parameter, which the caller controls. Redirect to a path this file names.',
        );
      }
    }
    if (/new URL\(\s*(?:request\.headers|request\.nextUrl\.searchParams)/.test(builder.body)) {
      errors.push(
        `${contract.middleware}: ${builder.name} builds a redirect URL straight out of the ` +
          'request, so the destination is whatever the caller asked for.',
      );
    }
  }
}

function checkMatcherCoverage({ source, routeSource, contract, errors }) {
  const patterns = matcherPatterns(source);
  if (patterns === null) {
    errors.push(`${contract.middleware}: declares no matcher, so it runs on nothing.`);
    return 0;
  }
  let covered = 0;
  for (const name of contract.coveredPrefixContracts) {
    const prefixes = declaredPrefixes(routeSource, name);
    if (prefixes === null || prefixes.length === 0) {
      errors.push(`${contract.routeContract}: declares no ${name}, so nothing was enumerated.`);
      continue;
    }
    for (const prefix of prefixes) {
      for (const pathname of [prefix, `${prefix}/anything`, `${prefix}/deep/path`]) {
        if (!matchesAnyPattern(pathname, patterns)) {
          errors.push(
            `${contract.middleware}: the matcher does not cover ${pathname}, which ${name} ` +
              'declares part of the product, so that route runs with no identity and no headers.',
          );
        }
      }
      covered += 1;
    }
  }
  for (const excluded of contract.deliberatelyOutsideMatcher) {
    if (matchesAnyPattern(excluded.path, patterns)) {
      errors.push(
        `${contract.middleware}: the matcher now covers ${excluded.path}, which is excluded on ` +
          `purpose. ${excluded.reason}`,
      );
    }
    if (typeof excluded.reason !== 'string' || excluded.reason.trim().length === 0) {
      errors.push(
        `${CONTRACT_PATH}: deliberatelyOutsideMatcher entry ${excluded.path} has no reason.`,
      );
    }
  }
  return covered;
}

export function checkEdgeMiddleware(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);

  const source = read(repoRoot, contract.middleware);
  if (source === null) {
    return {
      errors: [`${contract.middleware}: does not exist, so no request passes through it.`],
      report: { builders: 0, prefixes: 0 },
    };
  }
  const routeSource = read(repoRoot, contract.routeContract);
  if (routeSource === null) {
    return {
      errors: [`${contract.routeContract}: does not exist, so the matcher has nothing to cover.`],
      report: { builders: 0, prefixes: 0 },
    };
  }

  const builders = checkResponseHeaders({ source, contract, errors });
  checkRedirectTargets({ source, contract, errors });
  const prefixes = checkMatcherCoverage({ source, routeSource, contract, errors });

  return { errors, report: { builders, prefixes } };
}

function main() {
  const { errors, report } = checkEdgeMiddleware(REPO_ROOT);
  if (errors.length > 0) {
    console.error('Edge middleware check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-edge-middleware: OK (${report.builders} response builders, ${report.prefixes} route prefixes)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
