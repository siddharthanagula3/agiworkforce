import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { assertOwnerProtection } from '../organization-owner-protection';

describe('assertOwnerProtection', () => {
  it('lets an owner act on anyone who is not an owner', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      expect(() =>
        assertOwnerProtection({
          actorRole: 'admin',
          targetRole: 'member',
          ownerCount: 1,
          action,
        }),
      ).not.toThrow();
    }
  });

  it('never lets an admin act on an owner', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      const error = (() => {
        try {
          assertOwnerProtection({
            actorRole: 'admin',
            targetRole: 'owner',
            ownerCount: 5,
            action,
          });
          return null;
        } catch (thrown) {
          return thrown as { statusCode: number; message: string };
        }
      })();
      expect(error?.statusCode).toBe(403);
      expect(error?.message).toContain('Only a workspace owner can');
    }
  });

  it('never lets the last owner be removed, demoted or transferred away', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      const error = (() => {
        try {
          assertOwnerProtection({
            actorRole: 'owner',
            targetRole: 'owner',
            ownerCount: 1,
            action,
          });
          return null;
        } catch (thrown) {
          return thrown as { statusCode: number; message: string };
        }
      })();
      expect(error?.statusCode).toBe(409);
      expect(error?.message).toContain('cannot be recovered');
    }
  });

  it('lets an owner act on another owner once a second one exists', () => {
    expect(() =>
      assertOwnerProtection({
        actorRole: 'owner',
        targetRole: 'owner',
        ownerCount: 2,
        action: 'demote',
      }),
    ).not.toThrow();
  });
});
