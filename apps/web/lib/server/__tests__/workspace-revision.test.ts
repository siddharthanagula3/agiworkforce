import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  assertWorkspaceRevisionUnchanged,
  readExpectedWorkspaceRevision,
  readWorkspaceRevision,
  withWorkspaceRevisionHeaders,
  workspaceRevisionETag,
} from '../workspace-revision';

const ORG = '11111111-1111-4111-8111-111111111111';

function dbAt(revision: unknown): DatabaseAdapter {
  return { query: vi.fn(async () => [{ revision }]) } as unknown as DatabaseAdapter;
}

function withIfMatch(value: string): Request {
  return new Request('https://app.test/x', { headers: { 'If-Match': value } });
}

describe('readWorkspaceRevision', () => {
  it('reads the counter, tolerating the bigint that arrives as a string', async () => {
    await expect(readWorkspaceRevision(dbAt('12'), ORG)).resolves.toBe(12);
    await expect(readWorkspaceRevision(dbAt(12), ORG)).resolves.toBe(12);
  });

  it('is 0 for a workspace that has never been written to', async () => {
    await expect(readWorkspaceRevision(dbAt(null), ORG)).resolves.toBe(0);
  });
});

describe('readExpectedWorkspaceRevision', () => {
  it('is null when the caller states no expectation', () => {
    expect(readExpectedWorkspaceRevision(new Request('https://app.test/x'))).toBeNull();
    expect(readExpectedWorkspaceRevision(withIfMatch('*'))).toBeNull();
  });

  it('accepts the tag this endpoint hands out, weak or strong', () => {
    expect(readExpectedWorkspaceRevision(withIfMatch(workspaceRevisionETag(7)))).toBe(7);
    expect(readExpectedWorkspaceRevision(withIfMatch('"wsrev-7"'))).toBe(7);
  });

  it('refuses a tag it did not issue rather than ignoring it', () => {
    expect(() => readExpectedWorkspaceRevision(withIfMatch('"abc"'))).toThrow(/If-Match must be/);
  });
});

describe('assertWorkspaceRevisionUnchanged', () => {
  it('allows a write whose expected revision is current', async () => {
    await expect(assertWorkspaceRevisionUnchanged(dbAt(4), ORG, 4)).resolves.toBe(4);
  });

  it('allows a write that states no expectation', async () => {
    await expect(assertWorkspaceRevisionUnchanged(dbAt(4), ORG, null)).resolves.toBe(4);
  });

  it('refuses with 409 when another administrator moved the workspace on', async () => {
    await expect(assertWorkspaceRevisionUnchanged(dbAt(5), ORG, 4)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('withWorkspaceRevisionHeaders', () => {
  it('hands the caller the tag to send back', () => {
    const response = withWorkspaceRevisionHeaders(new Response('{}'), 9);
    expect(response.headers.get('ETag')).toBe('W/"wsrev-9"');
    expect(response.headers.get('x-workspace-revision')).toBe('9');
  });
});
