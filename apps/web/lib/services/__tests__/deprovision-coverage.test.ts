import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Resolves the app root by looking for a marker, not from `process.cwd()`.
 *
 * A coverage guard that resolves from the working directory fails with a wall
 * of unreadable-file errors the moment vitest is invoked from the repo root
 * instead of the app — noise that says nothing about the thing being guarded.
 */
function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();

/**
 * Every path that removes a member must revoke their credentials.
 *
 * Dropping the membership row stops the NEXT request from resolving the
 * workspace. It does nothing about the browser, desktop, mobile app or
 * developer key already holding credentials. A removal path that skips this
 * leaves a leaver with working access on one route while the others cut them
 * off — which is the offboarding hole an auditor looks for, and it is invisible
 * from the admin UI because the member does disappear from the list.
 */
const REMOVAL_PATHS = [
  { file: 'app/api/settings/team/[memberId]/route.ts', what: 'an admin removing a member' },
  {
    file: 'lib/server/scim/scim-provisioning-service.ts',
    what: 'SCIM deactivating or deleting a user',
  },
] as const;

function source(relative: string): string {
  return readFileSync(join(APP_ROOT, relative), 'utf8');
}

/** Extracts an exported async function body by brace-matching from its signature. */
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`export async function ${name}(`);
  if (start === -1) throw new Error(`${name} not found`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
  }
  throw new Error(`${name} body not terminated`);
}

describe('deprovision covers every removal path', () => {
  for (const { file, what } of REMOVAL_PATHS) {
    it(`${what} revokes credentials`, () => {
      expect(
        /deprovisionMember|revokeCredentialsAfterScimRemoval/.test(source(file)),
        `${file} removes a member without revoking their live credentials`,
      ).toBe(true);
    });
  }

  it('the SCIM path covers BOTH deactivate and delete', () => {
    // A user can leave a directory three ways: PATCH {active:false}, PUT with
    // active:false, or DELETE. A file-wide count is false assurance — delete +
    // replace alone satisfy "at least two calls" while patch stays unguarded, so
    // each removal function must itself contain the revoke.
    const text = source('lib/server/scim/scim-provisioning-service.ts');
    for (const name of ['patchScimUser', 'deleteScimUser', 'replaceScimUser']) {
      expect(
        functionBody(text, name),
        `${name} deactivates or removes a user without revoking their live credentials`,
      ).toMatch(/revokeCredentialsAfterScimRemoval\(/);
    }
  });

  it('the SCIM path never throws on a revocation failure', () => {
    // An IdP reads a non-2xx as a failed deprovision and retries, re-running a
    // revoke that already succeeded and reporting the whole operation failed
    // when the membership WAS revoked.
    const text = source('lib/server/scim/scim-provisioning-service.ts');
    const at = text.indexOf('async function revokeCredentialsAfterScimRemoval');
    const helper = text.slice(at, at + 1400);

    expect(helper).toMatch(/try\s*\{/);
    expect(helper).toMatch(/catch/);
    expect(helper, 'the helper must return its warnings, not rethrow').toMatch(/return \[/);
  });

  it('member removal reports what it could not reach', () => {
    // A deprovision that silently half-succeeded is worse than one that failed
    // loudly: the administrator walks away believing the person is cut off.
    const text = source('app/api/settings/team/[memberId]/route.ts');
    expect(text).toMatch(/warnings/);
    expect(text).toMatch(/deprovision\.errors/);
  });
});
