import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_MODULE,
  auditRegistries,
  findErrorRegistries,
  parseCanonicalCodes,
} from './lib/error-vocabulary.mjs';

const CANONICAL = `export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;`;

/** The shape apps/web/shared/lib/error-utils.ts had at 6a4e605fb. */
const FORK = `export const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;`;

const codes = parseCanonicalCodes(CANONICAL);
const audit = (source, file = 'apps/web/shared/lib/error-utils.ts') =>
  auditRegistries(findErrorRegistries(source, file), codes);

test('the canonical registry parses to its members', () => {
  assert.equal(codes.size, 9);
  assert.ok(codes.has('RATE_LIMIT_EXCEEDED'));
});

test('the real fork this change removed is caught, and the canonical spelling is named', () => {
  const errors = audit(FORK);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /RATE_LIMIT \(canonical: RATE_LIMIT_EXCEEDED\)/);
  assert.match(errors[0], /SERVER_ERROR \(canonical: INTERNAL_ERROR\)/);
  assert.match(errors[0], /UNKNOWN \(canonical: INTERNAL_ERROR\)/);
});

test('a fork with no contradictory spelling is still caught as a fork', () => {
  const errors = audit(`export const ApiErrors = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
  } as const;`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /redeclares 3 codes/);
});

test('renaming the fork does not dodge the guard', () => {
  assert.equal(audit(FORK.replace('ErrorCodes', 'FailureKinds')).length, 1);
});

test('the canonical module itself is not a fork of itself', () => {
  assert.deepEqual(auditRegistries(findErrorRegistries(CANONICAL, CANONICAL_MODULE), codes), []);
});

test('re-exporting the canonical registry is clean', () => {
  assert.deepEqual(audit("export { ErrorCode } from '@agiworkforce/types';"), []);
});

test('a domain enum that shares no canonical code is left alone', () => {
  assert.deepEqual(
    audit(`export const SyncState = {
      IDLE: 'IDLE',
      PENDING: 'PENDING',
      BLOCKED: 'BLOCKED',
    } as const;`),
    [],
  );
});

test('a two-member object is too small to be a registry', () => {
  assert.deepEqual(
    findErrorRegistries(
      "const X = { UNAUTHORIZED: 'UNAUTHORIZED', FORBIDDEN: 'FORBIDDEN' };",
      'a.ts',
    ),
    [],
  );
});

test('a fork inside a comment is not a fork', () => {
  assert.deepEqual(
    audit(
      FORK.split('\n')
        .map((line) => `// ${line}`)
        .join('\n'),
    ),
    [],
  );
});
