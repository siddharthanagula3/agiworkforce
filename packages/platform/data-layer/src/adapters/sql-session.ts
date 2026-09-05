/**
 * @file adapters/sql-session.ts
 * @module @agiworkforce/data-layer/adapters/sql-session
 *
 * Session plumbing shared by every Postgres-speaking adapter: the transaction
 * control statements, the tenant-scope preamble the RLS policies read, and the
 * JWT subject decoder.
 *
 * SECURITY: the tenant scope is bound with transaction-local settings only
 * (`SET LOCAL` and `set_config(..., true)`). Both are reverted by COMMIT and by
 * ROLLBACK, which is what stops one request's tenant from surviving on a pooled
 * connection into the next request's checkout. An adapter that binds the scope
 * outside a transaction breaks tenant isolation across the whole product.
 *
 * Internal to the adapters. Not re-exported from the package entrypoint.
 */

import { DataLayerConfigError } from '../types';

const STATEMENT_CONTEXT_MAX_LENGTH = 500;
const WHITESPACE_RUN = /\s+/g;

/**
 * Postgres reports a failing statement by parameter index and character offset
 * alone, so an error like "could not determine data type of parameter $4" names
 * no query and no table. Attaching the statement (never the parameter values,
 * which carry user content) makes the offending SQL identifiable from a log
 * line.
 */
export function withStatementContext(error: unknown, sql: string): unknown {
  if (!(error instanceof Error) || 'statement' in error) return error;
  Object.defineProperty(error, 'statement', {
    value: sql.replace(WHITESPACE_RUN, ' ').trim().slice(0, STATEMENT_CONTEXT_MAX_LENGTH),
    enumerable: true,
  });
  return error;
}

const RLS_ROLE = 'app_rls';
const TENANT_SUBJECT_SETTING = 'request.jwt.claim.sub';
const TENANT_ORGANIZATION_SETTING = 'request.jwt.claim.org_id';

export const BEGIN_STATEMENT = 'BEGIN';
export const COMMIT_STATEMENT = 'COMMIT';
export const ROLLBACK_STATEMENT = 'ROLLBACK';

/**
 * The connecting role owns the schema and on Neon carries BYPASSRLS, so every
 * policy would be skipped without this role switch. `app_rls` is NOBYPASSRLS
 * with DML grants only (apps/web/db/neon/0037_rls_user_isolation.sql).
 */
export const BEGIN_RLS_SCOPE_STATEMENT = `${BEGIN_STATEMENT}; SET LOCAL ROLE ${RLS_ROLE}`;

export const BIND_TENANT_SCOPE_STATEMENT =
  `SELECT set_config('${TENANT_SUBJECT_SETTING}', $1, true), ` +
  `set_config('${TENANT_ORGANIZATION_SETTING}', $2, true)`;

export const NO_ORGANIZATION_SCOPE = '';

const JWT_SEGMENT_COUNT = 3;
const BASE64URL_MINUS = /-/g;
const BASE64URL_UNDERSCORE = /_/g;
const BASE64_QUANTUM = 4;
const BASE64_PAD = '=';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Decode the `sub` claim from a JWT WITHOUT verifying its signature.
 *
 * @internal SECURITY: this trusts an UNVERIFIED token. An attacker who can
 * reach a caller that forwards a self-minted JWT here controls the `sub` that
 * drives RLS, i.e. impersonation. It is ONLY safe when the caller has already
 * verified the signature (Clerk `verifyToken` / `ClerkAuthAdapter.verifyJwt`)
 * BEFORE handing the token to `withUser`. Because that precondition is
 * invisible from here, every `withUser` is default-deny: it refuses to call
 * this unless the adapter was explicitly constructed with
 * `unsafeAllowUnverifiedJwtSubject: true`. Do not export this from the package.
 *
 * Throws if the JWT is malformed (wrong segment count, non-JSON middle,
 * missing/non-string `sub`). Throwing surfaces operator config bugs early
 * rather than silently dropping RLS context.
 */
export function decodeJwtSub(jwt: string, adapterName: string): string {
  const prefix = `${adapterName} withUser:`;
  const parts = jwt.split('.');
  if (parts.length !== JWT_SEGMENT_COUNT) {
    throw new DataLayerConfigError(
      `${prefix} expected a ${JWT_SEGMENT_COUNT}-segment JWT, got ${parts.length}-segment token.`,
    );
  }
  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new DataLayerConfigError(`${prefix} empty JWT payload segment.`);
  }
  const b64 = payloadSegment.replace(BASE64URL_MINUS, '+').replace(BASE64URL_UNDERSCORE, '/');
  const padded =
    b64 + BASE64_PAD.repeat((BASE64_QUANTUM - (b64.length % BASE64_QUANTUM)) % BASE64_QUANTUM);
  let json: string;
  try {
    if (typeof globalThis.atob === 'function') {
      json = globalThis.atob(padded);
    } else {
      json = Buffer.from(padded, 'base64').toString('utf8');
    }
  } catch (e) {
    throw new DataLayerConfigError(`${prefix} failed to base64-decode JWT payload: ${describe(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new DataLayerConfigError(`${prefix} JWT payload is not valid JSON: ${describe(e)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new DataLayerConfigError(`${prefix} JWT payload is not an object.`);
  }
  const sub = (parsed as Record<string, unknown>)['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new DataLayerConfigError(`${prefix} JWT payload has no string \`sub\` claim.`);
  }
  return sub;
}
