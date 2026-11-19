import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { productionPolicySource } = await import('../policy-source');

const failingDb = {
  query: async () => {
    throw new Error('database unavailable');
  },
} as unknown as DatabaseAdapter;

const ACCOUNT = {
  db: failingDb,
  userId: 'user-1',
  organizationId: 'org-1',
  conversationId: 'conversation-1',
};

describe('the production policy source when the database cannot answer', () => {
  it('counts the training opt-out as on', async () => {
    await expect(productionPolicySource.trainingOptOut(ACCOUNT)).resolves.toBe(true);
  });

  it('counts the conversation as kept out of training', async () => {
    await expect(productionPolicySource.conversationKeepsOutOfTraining(ACCOUNT)).resolves.toBe(
      true,
    );
  });

  it('fails the workspace model policy read', async () => {
    await expect(productionPolicySource.workspaceModelPolicy(ACCOUNT)).rejects.toThrow();
  });

  it('fails the workspace region read', async () => {
    await expect(productionPolicySource.workspaceRegion(ACCOUNT)).rejects.toThrow();
  });

  it('fails the retention requirement read', async () => {
    await expect(productionPolicySource.zeroDataRetentionRequired(ACCOUNT)).rejects.toThrow();
  });

  it('routes without the user’s own US-only preference', async () => {
    await expect(productionPolicySource.usOnly(ACCOUNT)).resolves.toBe(false);
  });
});

describe('the production policy source for an account outside any workspace', () => {
  const personal = { ...ACCOUNT, organizationId: null, conversationId: null };

  it('has no workspace policy or region to read', async () => {
    await expect(productionPolicySource.workspaceModelPolicy(personal)).resolves.toBeNull();
    await expect(productionPolicySource.workspaceRegion(personal)).resolves.toBeNull();
  });

  it('has no conversation to protect', async () => {
    await expect(productionPolicySource.conversationKeepsOutOfTraining(personal)).resolves.toBe(
      false,
    );
  });
});
