import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  return readFileSync(join(process.cwd(), relative), 'utf8');
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
    // A user can leave a directory two ways. Covering only one leaves the other
    // silently intact.
    const text = source('lib/server/scim/scim-provisioning-service.ts');
    const calls = [...text.matchAll(/revokeCredentialsAfterScimRemoval\(/g)];
    expect(
      calls.length,
      'both patchScimUser and deleteScimUser must revoke',
    ).toBeGreaterThanOrEqual(2);
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
