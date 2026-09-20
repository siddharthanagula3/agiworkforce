import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkEdgeMiddleware,
  declaredPrefixes,
  loadContract,
  matcherPatterns,
  matchesAnyPattern,
  responseBuilders,
} from './check-edge-middleware.mjs';

const roots = [];
const contract = loadContract(REPO_ROOT);
const middleware = readFileSync(path.join(REPO_ROOT, contract.middleware), 'utf8');
const routeContract = readFileSync(path.join(REPO_ROOT, contract.routeContract), 'utf8');

/** A copy of the real middleware with one thing changed. */
function fixture({ source = middleware, routes = routeContract, overrides = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'edge-middleware-'));
  roots.push(root);
  for (const [relative, body] of [
    [contract.middleware, source],
    [contract.routeContract, routes],
    [CONTRACT_PATH, JSON.stringify({ ...contract, ...overrides })],
  ]) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), body);
  }
  return root;
}

function errorsFor(options) {
  return checkEdgeMiddleware(fixture(options)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors, report } = checkEdgeMiddleware(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.builders >= 5, 'every response builder in the middleware is measured');
  assert.ok(report.prefixes > 10, 'every declared route prefix is measured');
});

test('the fixture round trips unchanged', () => {
  assert.deepEqual(errorsFor({}), []);
});

test('it finds every response builder the middleware declares', () => {
  const names = responseBuilders(middleware).map((builder) => builder.name);
  for (const expected of [
    'buildCspResponse',
    'buildProductRewriteResponse',
    'buildSignedOutRedirect',
    'identityUnconfiguredResponse',
    'apiHostRedirect',
    'euAccessBlock',
  ]) {
    assert.ok(names.includes(expected), `${expected} is measured`);
  }
});

test('a response builder that stops setting the security header fails', () => {
  for (const builder of responseBuilders(middleware)) {
    const stripped = middleware.replace(
      builder.body,
      builder.body.replace(/response\.headers\.set\(\s*'Content-Security-Policy',[\s\S]*?\);/g, ''),
    );
    if (stripped === middleware) continue;
    const errors = checkEdgeMiddleware(fixture({ source: stripped })).errors;
    assert.ok(
      errors.some((error) => error.includes(builder.name)),
      `dropping the header in ${builder.name} is caught`,
    );
  }
});

test('the region block specifically cannot serve its page without the header', () => {
  const block = responseBuilders(middleware).find((builder) => builder.name === 'euAccessBlock');
  assert.ok(block, 'the region block is a response builder');
  const stripped = middleware.replace(
    "  response.headers.set('Content-Security-Policy', csp);\n  response.headers.set('x-agi-region-block'",
    "  response.headers.set('x-agi-region-block'",
  );
  assert.notEqual(stripped, middleware, 'the mutation applied');
  const errors = checkEdgeMiddleware(fixture({ source: stripped })).errors;
  assert.ok(errors.some((error) => /euAccessBlock returns a response without setting/.test(error)));
});

test('an exemption needs a reason, and cannot outlive the builder it covers', () => {
  const stripped = middleware.replace(
    "  response.headers.set('Content-Security-Policy', csp);\n  response.headers.set('x-agi-region-block'",
    "  response.headers.set('x-agi-region-block'",
  );
  assert.deepEqual(
    errorsFor({
      source: stripped,
      overrides: { headerExempt: [{ name: 'euAccessBlock', reason: 'it serves no body' }] },
    }),
    [],
  );

  const noReason = errorsFor({
    source: stripped,
    overrides: { headerExempt: [{ name: 'euAccessBlock', reason: '' }] },
  });
  assert.ok(noReason.some((error) => /carries no reason/.test(error)));

  const stale = errorsFor({
    overrides: { headerExempt: [{ name: 'euAccessBlock', reason: 'it serves no body' }] },
  });
  assert.ok(stale.some((error) => /Delete the entry/.test(error)));

  const unknown = errorsFor({
    overrides: { headerExempt: [{ name: 'noSuchBuilder', reason: 'historic' }] },
  });
  assert.ok(unknown.some((error) => /is not a response builder/.test(error)));
});

test('a redirect built from a caller-supplied parameter fails', () => {
  const opened = middleware.replace(
    '  const response = NextResponse.redirect(target, 307);',
    "  const wanted = request.nextUrl.searchParams.get('returnTo');\n  const response = NextResponse.redirect(wanted ?? target, 307);",
  );
  assert.notEqual(opened, middleware, 'the mutation applied');
  const errors = checkEdgeMiddleware(fixture({ source: opened })).errors;
  assert.ok(errors.some((error) => /builds a redirect out of the "returnTo"/.test(error)));
});

test('a redirect URL built straight out of the request fails', () => {
  const opened = middleware.replace(
    '  const response = NextResponse.redirect(target, 307);',
    "  const response = NextResponse.redirect(new URL(request.headers.get('x-forwarded-host') ?? '/'), 307);",
  );
  const errors = checkEdgeMiddleware(fixture({ source: opened })).errors;
  assert.ok(
    errors.some((error) => /straight out of the\s+request/.test(error.replace(/\n/g, ' '))),
  );
});

test('a product prefix the matcher stops covering fails', () => {
  const widened = middleware.replace("'/((?!_next/static", "'/((?!chat|_next/static");
  assert.notEqual(widened, middleware, 'the mutation applied');
  const errors = checkEdgeMiddleware(fixture({ source: widened })).errors;
  assert.ok(errors.some((error) => /does not cover \/chat/.test(error)));
});

test('a new product prefix with no matcher coverage fails', () => {
  const extended = routeContract.replace(
    "  '/welcome',\n] as const",
    "  '/welcome',\n  '/favicon.ico',\n] as const",
  );
  assert.notEqual(extended, routeContract, 'the mutation applied');
  const errors = checkEdgeMiddleware(fixture({ routes: extended })).errors;
  assert.ok(errors.some((error) => /does not cover \/favicon\.ico/.test(error)));
});

test('a signed webhook pulled back inside the matcher fails', () => {
  const narrowed = middleware.replace(/api\/stripe-webhook\|/g, '');
  assert.notEqual(narrowed, middleware, 'the mutation applied');
  const errors = checkEdgeMiddleware(fixture({ source: narrowed })).errors;
  assert.ok(errors.some((error) => /now covers \/api\/stripe-webhook/.test(error)));
});

test('a middleware with no matcher and a missing file are both reported', () => {
  const noMatcher = middleware.replace(/export const config = \{[\s\S]*?\};\n/, '');
  assert.ok(
    checkEdgeMiddleware(fixture({ source: noMatcher })).errors.some((error) =>
      /declares no matcher/.test(error),
    ),
  );

  const root = mkdtempSync(path.join(tmpdir(), 'edge-middleware-missing-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(root, CONTRACT_PATH), JSON.stringify(contract));
  const { errors } = checkEdgeMiddleware(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no request passes through it/);
});

test('the helpers read what the rules depend on', () => {
  assert.ok(declaredPrefixes(routeContract, 'PRODUCT_ROUTE_PREFIXES').includes('/chat'));
  assert.equal(declaredPrefixes(routeContract, 'NO_SUCH_LIST'), null);

  const patterns = matcherPatterns(middleware);
  assert.ok(patterns.length >= 2);
  assert.equal(matchesAnyPattern('/chat/abc', patterns), true);
  assert.equal(matchesAnyPattern('/api/stripe-webhook', patterns), false);
  assert.equal(matchesAnyPattern('/anything', ['(']), false);
});
