import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { assertBoundary, createManagedCloudRequestContext, fetch, fetchExternal, getHeaders } =
  vi.hoisted(() => ({
    assertBoundary: vi.fn(),
    createManagedCloudRequestContext: vi.fn(),
    fetch: vi.fn(),
    fetchExternal: vi.fn(),
    getHeaders: vi.fn(),
  }));

vi.mock('../managedCloudRequestContext', () => ({ createManagedCloudRequestContext }));

import { desktopCloudProjectKnowledge } from '../desktopCloudProjectKnowledge';
import { desktopCloudProjects } from '../desktopCloudProjects';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Desktop Managed Cloud project adapters', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.clearAllMocks();
    getHeaders.mockResolvedValue({ Authorization: 'Bearer project-token' });
    fetch.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === '/api/projects' && init?.method === 'GET') {
        return jsonResponse({ projects: [] });
      }
      if (url.pathname === '/api/projects/project-1/knowledge-files' && init?.method === 'GET') {
        return jsonResponse({ files: [] });
      }
      throw new Error(`Unexpected project adapter request: ${init?.method} ${url.pathname}`);
    });
    fetchExternal.mockResolvedValue(new Response(null, { status: 200 }));
    createManagedCloudRequestContext.mockReturnValue({
      assertBoundary,
      fetch,
      fetchExternal,
      getHeaders,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a bearer-authenticated request context for project and knowledge lists', async () => {
    await expect(desktopCloudProjects.listProjects()).resolves.toEqual([]);
    await expect(desktopCloudProjectKnowledge.list('project-1')).resolves.toEqual([]);

    expect(createManagedCloudRequestContext).toHaveBeenNthCalledWith(1, 'Managed Cloud projects');
    expect(createManagedCloudRequestContext).toHaveBeenNthCalledWith(2, 'Cloud project knowledge');
    expect(getHeaders).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls as Array<[string, RequestInit]>) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer project-token');
      expect(init.credentials).toBe('include');
    }
    expect(assertBoundary).toHaveBeenCalledTimes(2);
  });

  it('routes the signed knowledge upload through the boundary-guarded external fetch', async () => {
    const checksum = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    fetch.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === '/api/uploads/presign' && init?.method === 'POST') {
        return jsonResponse({
          uploadUrl: 'https://storage.example.test/signed-upload',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
          storageKey: 'knowledge-files/projects/project-1/notes.txt',
        });
      }
      if (url.pathname === '/api/projects/project-1/knowledge-files' && init?.method === 'POST') {
        return jsonResponse(
          {
            file: {
              id: 'file-1',
              projectId: 'project-1',
              fileName: 'notes.txt',
              mimeType: 'text/plain',
              byteCount: 5,
              checksumSha256: checksum,
              summary: null,
              sourceSurface: 'desktop',
              addedByUserId: 'account-a',
              addedAt: '2026-08-01T12:00:00.000Z',
              retentionExpiresAt: null,
              deletedAt: null,
              storageUri: '/api/projects/project-1/knowledge-files/file-1',
            },
          },
          201,
        );
      }
      throw new Error(`Unexpected project upload request: ${init?.method} ${url.pathname}`);
    });
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expect(desktopCloudProjectKnowledge.upload('project-1', file)).resolves.toMatchObject({
      id: 'file-1',
      checksumSha256: checksum,
    });
    expect(fetchExternal).toHaveBeenCalledWith(
      'https://storage.example.test/signed-upload',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    expect(assertBoundary).toHaveBeenCalled();
  });
});
