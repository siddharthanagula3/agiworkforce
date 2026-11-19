import { describe, expect, it } from 'vitest';
import { CloudCodeSessionDetailSchema, CloudCodeSharedSessionSchema } from '../cloud-code-sessions';

const SESSION = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Workspace',
  repositoryUrl: null,
  networkAccess: 'none',
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  updatedAt: '2026-09-07T12:00:00.000Z',
  closedAt: null,
};

describe('CloudCodeSessionDetailSchema', () => {
  it('reads a detail from a server that predates the truncation flag as complete', () => {
    const detail = CloudCodeSessionDetailSchema.parse({ session: SESSION, terminalEntries: [] });

    expect(detail.turnsTruncated).toBe(false);
  });

  it('carries the flag that says older turns were left out of the window', () => {
    const detail = CloudCodeSessionDetailSchema.parse({
      session: SESSION,
      terminalEntries: [],
      turns: [],
      turnsTruncated: true,
    });

    expect(detail.turnsTruncated).toBe(true);
  });
});

describe('CloudCodeSharedSessionSchema', () => {
  const SHARED = {
    visibility: 'public',
    ownerName: null,
    title: 'Workspace',
    repositoryUrl: null,
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    createdAt: '2026-09-07T12:00:00.000Z',
    updatedAt: '2026-09-07T12:00:00.000Z',
    terminalEntries: [],
    turns: [],
  };

  it('reads a share from a server that predates the truncation flag as complete', () => {
    expect(CloudCodeSharedSessionSchema.parse(SHARED).turnsTruncated).toBe(false);
  });

  it('carries the flag that says older turns were left out of the window', () => {
    expect(
      CloudCodeSharedSessionSchema.parse({ ...SHARED, turnsTruncated: true }).turnsTruncated,
    ).toBe(true);
  });
});
