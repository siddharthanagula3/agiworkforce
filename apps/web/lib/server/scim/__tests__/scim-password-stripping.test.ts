import { describe, expect, it } from 'vitest';
import { stripScimSensitiveAttributes } from '../scim-provisioning-service';

/**
 * Regression guard for plaintext credential persistence.
 *
 * The SCIM provisioning service persists the IdP's request body to
 * `scim_provisioned_users.raw_attributes`. RFC 7643 §4.1.1 makes `password` a
 * writable User attribute and real IdPs push it, so persisting the body
 * verbatim wrote plaintext credentials to the database and into every backup.
 */
describe('stripScimSensitiveAttributes', () => {
  it('removes a top-level password', () => {
    const out = stripScimSensitiveAttributes({
      userName: 'ada@example.com',
      password: 'hunter2',
      active: true,
    }) as Record<string, unknown>;

    expect(out).not.toHaveProperty('password');
    expect(out['userName']).toBe('ada@example.com');
    expect(out['active']).toBe(true);
  });

  it('is case-insensitive, because SCIM attribute names are', () => {
    const out = stripScimSensitiveAttributes({
      Password: 'hunter2',
      PASSWORD: 'hunter2',
      newPassword: 'hunter3',
    }) as Record<string, unknown>;

    expect(Object.keys(out)).toEqual([]);
  });

  it('strips passwords nested inside schema extensions', () => {
    // IdPs put attributes inside extension objects; a top-level-only filter
    // would leave the credential behind.
    const out = stripScimSensitiveAttributes({
      userName: 'ada@example.com',
      'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
        department: 'Engineering',
        password: 'hunter2',
      },
    }) as Record<string, Record<string, unknown>>;

    const extension = out['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']!;
    expect(extension).not.toHaveProperty('password');
    expect(extension['department']).toBe('Engineering');
  });

  it('strips passwords inside arrays', () => {
    const out = stripScimSensitiveAttributes({
      members: [{ value: 'a', password: 'x' }, { value: 'b' }],
    }) as { members: Record<string, unknown>[] };

    expect(out.members[0]).not.toHaveProperty('password');
    expect(out.members[0]!['value']).toBe('a');
    expect(out.members[1]!['value']).toBe('b');
  });

  it('leaves every non-sensitive attribute untouched', () => {
    const input = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'ada@example.com',
      name: { givenName: 'Ada', familyName: 'Lovelace' },
      emails: [{ value: 'ada@example.com', primary: true }],
      active: true,
      externalId: 'idp-1',
    };
    expect(stripScimSensitiveAttributes(input)).toEqual(input);
  });
});
