import { describe, expect, it } from 'vitest';

import { subjectIsStoredUserId } from '../identities';

describe('stored user id subjects', () => {
  it('treats a clerk subject as the stored user id and no other provider', () => {
    expect(subjectIsStoredUserId('clerk')).toBe(true);
    expect(subjectIsStoredUserId('auth0')).toBe(false);
  });
});
