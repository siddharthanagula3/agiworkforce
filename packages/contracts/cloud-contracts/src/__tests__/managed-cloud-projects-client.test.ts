import { describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudProjectsContractError,
  createManagedCloudProjectsClient,
} from '../managed-cloud-projects-client';

const project = {
  id: '0190a000-0000-7000-8000-0000000000d1',
  ownerUserId: 'user-1',
  organizationId: null,
  name: 'Launch plan',
  description: null,
  instructions: 'Ship it',
  color: '#3b82f6',
  isArchived: false,
  metadata: null,
  defaultPrivacyMode: 'managed',
  defaultProviderMode: 'ManagedGateway',
  allowedSurfaces: ['web', 'desktop', 'mobile'],
  defaultModelId: null,
  lastUsedAt: null,
  iconEmoji: null,
  accentColor: null,
  importedFrom: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('createManagedCloudProjectsClient', () => {
  it('runtime-validates CRUD responses and uses canonical encoded paths', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ projects: [project] }))
      .mockResolvedValueOnce(response({ project }))
      .mockResolvedValueOnce(response({ project }, 201))
      .mockResolvedValueOnce(response({ project: { ...project, name: 'Renamed' } }))
      .mockResolvedValueOnce(response({ success: true }));
    const client = createManagedCloudProjectsClient({
      baseUrl: 'https://cloud.example/',
      fetchImpl,
      credentials: 'include',
      getHeaders: async ({ mutation }): Promise<HeadersInit> =>
        mutation ? { 'x-csrf-token': 'csrf' } : { Authorization: 'Bearer token' },
    });

    await client.listProjects({ limit: 100, offset: 0 });
    await client.getProject('project/with spaces');
    await client.createProject({ name: 'Launch plan' });
    await client.updateProject(project.id, { name: 'Renamed' });
    await client.deleteProject(project.id);

    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      'https://cloud.example/api/projects?limit=100&offset=0',
      'https://cloud.example/api/projects/project%2Fwith%20spaces',
      'https://cloud.example/api/projects',
      `https://cloud.example/api/projects/${project.id}`,
      `https://cloud.example/api/projects/${project.id}`,
    ]);
    expect(calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(calls[2]?.[1].headers).toMatchObject({
      'content-type': 'application/json',
      'x-csrf-token': 'csrf',
    });
  });

  it('keeps sync core-only and runtime-validates pull and push envelopes', async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        projects: [
          {
            id: project.id,
            name: project.name,
            description: null,
            instructions: null,
            color: null,
            is_archived: false,
            metadata: null,
            created_at: project.createdAt,
            updated_at: project.updatedAt,
            deleted_at: null,
            server_version: '4',
          },
        ],
        cursor: '4',
        hasMore: false,
      })
      .mockResolvedValueOnce({
        applied: [{ id: project.id, server_version: '5' }],
        conflicts: [],
        cursor: '5',
      });
    const client = createManagedCloudProjectsClient({ requestJson });

    const pulled = await client.pullProjects('0');
    const pushed = await client.pushProjects({
      projects: [
        {
          id: project.id,
          name: project.name,
          baseVersion: '4',
          defaultPrivacyMode: 'managed',
        } as never,
      ],
    });

    expect(pulled.cursor).toBe('4');
    expect(pushed.cursor).toBe('5');
    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: 'GET', path: '/api/projects/sync?since=0' }),
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: '/api/projects/sync',
        body: {
          projects: [{ id: project.id, name: project.name, baseVersion: '4' }],
        },
      }),
    );
  });

  it('fails closed when a successful response violates the project contract', async () => {
    const client = createManagedCloudProjectsClient({
      fetchImpl: vi.fn(async () => response({ projects: [{ id: project.id }] })),
    });

    await expect(client.listProjects()).rejects.toBeInstanceOf(ManagedCloudProjectsContractError);
  });

  it('rejects developer-session surfaces before a Managed Cloud project request is sent', async () => {
    const requestJson = vi.fn();
    const client = createManagedCloudProjectsClient({ requestJson });

    await expect(
      client.createProject({ name: 'Cloud only', allowedSurfaces: ['cli'] as never }),
    ).rejects.toBeInstanceOf(ManagedCloudProjectsContractError);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('rejects Local and BYOK trust defaults before a Managed Cloud request is sent', async () => {
    const requestJson = vi.fn();
    const client = createManagedCloudProjectsClient({ requestJson });

    await expect(
      client.createProject({ name: 'Wrong trust plane', defaultPrivacyMode: 'byok' as never }),
    ).rejects.toBeInstanceOf(ManagedCloudProjectsContractError);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range sync cursor before transport', async () => {
    const requestJson = vi.fn();
    const client = createManagedCloudProjectsClient({ requestJson });

    await expect(client.pullProjects('9999999999999999999')).rejects.toBeInstanceOf(
      ManagedCloudProjectsContractError,
    );
    expect(requestJson).not.toHaveBeenCalled();
  });
});
