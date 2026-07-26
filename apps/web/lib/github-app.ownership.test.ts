import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(() => ({
    query: vi.fn(async () => []),
    execute: vi.fn(),
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => mocks.getNeonDb(),
}));

import { getInstallationAccessToken } from './github-app';

describe('GitHub installation token ownership boundary', () => {
  it('does not mint or read a token for an installation whose user ownership is unverified', async () => {
    await expect(getInstallationAccessToken(987654)).rejects.toThrow(/ownership.*verified/i);
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
  });
});
