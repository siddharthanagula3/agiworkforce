// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createObjectCleanupPlan, createPrivateObjectWriter } from './object-storage';
import { deleteProjectKnowledgeObject } from './project-knowledge-object-storage';

const servers: Server[] = [];
const requests: {
  method: string | undefined;
  host: string | undefined;
  path: string;
  authorization: string;
  body: Buffer;
}[] = [];

async function endpoint(): Promise<string> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      method: request.method,
      host: request.headers.host,
      path: new URL(request.url ?? '/', 'http://localhost').pathname,
      authorization: request.headers.authorization ?? '',
      body: Buffer.concat(chunks),
    });
    response.writeHead(204);
    response.end();
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return `http://127.0.0.1:${address.port}`;
}

function configure(address: string): void {
  vi.stubEnv('AGI_STORAGE_PROVIDER', 's3');
  vi.stubEnv('AGI_STORAGE_ENDPOINT', address);
  vi.stubEnv('AGI_STORAGE_REGION', 'fixture-region');
  vi.stubEnv('AGI_STORAGE_FORCE_PATH_STYLE', 'true');
  vi.stubEnv('AGI_STORAGE_ACCESS_KEY_ID', 'fixture-access');
  vi.stubEnv('AGI_STORAGE_SECRET_ACCESS_KEY', 'fixture-secret');
  vi.stubEnv('AGI_STORAGE_PRIVATE_BUCKET', 'private-fixture');
  vi.stubEnv('AGI_STORAGE_BUCKET', 'public-fixture');
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  requests.length = 0;
});

describe('pinned object cleanup', () => {
  it('binds a write receipt to the client and namespace that received its bytes', async () => {
    const first = await endpoint();
    configure(first);
    const writer = createPrivateObjectWriter();
    const cleanup = createObjectCleanupPlan();
    expect(writer.target).toBe(cleanup.targets['private']);
    configure(await endpoint());
    vi.stubEnv('AGI_STORAGE_REGION', 'changed-region');
    vi.stubEnv('AGI_STORAGE_PRIVATE_BUCKET', 'changed-fixture');
    expect(createPrivateObjectWriter().target).not.toBe(writer.target);
    const bytes = Buffer.from('inspected fixture bytes');
    await writer.put({
      key: 'knowledge/fixture.txt',
      data: bytes,
      contentType: 'text/plain',
      contentLength: bytes.byteLength,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      host: new URL(first).host,
      path: '/private-fixture/knowledge/fixture.txt',
      body: bytes,
    });
    expect(requests[0]?.authorization).toContain('/fixture-region/s3/');
  });

  it('uses the captured plan for the existing project-object cleanup entrypoint', async () => {
    configure(await endpoint());
    await deleteProjectKnowledgeObject('knowledge/fixture.txt');
    expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'DELETE', path: '/private-fixture/knowledge/fixture.txt' },
      { method: 'DELETE', path: '/public-fixture/knowledge/fixture.txt' },
    ]);
  });

  it('keeps the actual client, buckets and signing region after configuration changes', async () => {
    const first = await endpoint();
    configure(first);
    const plan = createObjectCleanupPlan();
    const second = await endpoint();
    configure(second);
    vi.stubEnv('AGI_STORAGE_PRIVATE_BUCKET', 'changed-fixture');
    vi.stubEnv('AGI_STORAGE_REGION', 'changed-region');
    const changed = createObjectCleanupPlan();
    expect(changed.targets).not.toEqual(plan.targets);
    for (const [name, location] of Object.entries(plan.targets)) {
      await plan.remove({ name, location, objectKey: 'knowledge/fixture.txt' });
    }
    expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'DELETE', path: '/private-fixture/knowledge/fixture.txt' },
      { method: 'DELETE', path: '/public-fixture/knowledge/fixture.txt' },
    ]);
    expect(requests.every((request) => request.host === new URL(first).host)).toBe(true);
    expect(requests.every((request) => request.authorization.includes('/fixture-region/s3/'))).toBe(
      true,
    );
    expect(requests.every((request) => !request.authorization.includes('/changed-region/'))).toBe(
      true,
    );
  });

  it('pins namespace changes but keeps credential rotation and CDN changes out of identity', async () => {
    configure(await endpoint());
    const original = createObjectCleanupPlan();
    vi.stubEnv('AGI_STORAGE_ACCESS_KEY_ID', 'rotated-access');
    vi.stubEnv('AGI_STORAGE_SECRET_ACCESS_KEY', 'rotated-secret');
    vi.stubEnv('AGI_STORAGE_PUBLIC_BASE_URL', 'https://changed.example.test');
    expect(createObjectCleanupPlan().targets).toEqual(original.targets);
    for (const [setting, value] of [
      ['AGI_STORAGE_ENDPOINT', 'http://127.0.0.1:1'],
      ['AGI_STORAGE_REGION', 'changed-region'],
      ['AGI_STORAGE_FORCE_PATH_STYLE', 'false'],
      ['AGI_STORAGE_PRIVATE_BUCKET', 'changed-private'],
    ] as const) {
      const previous = process.env[setting];
      vi.stubEnv(setting, value);
      expect(createObjectCleanupPlan().targets['private'], setting).not.toBe(
        original.targets['private'],
      );
      vi.stubEnv(setting, previous);
    }
    expect(JSON.stringify(original.targets)).not.toMatch(
      /fixture-secret|fixture-access|127\.0\.0\.1/,
    );
    expect(requests).toEqual([]);
  });

  it('rejects changed identities, unknown target labels and URL aliases before sending', async () => {
    configure(await endpoint());
    const plan = createObjectCleanupPlan();
    for (const target of [
      { name: 'private', location: 'changed', objectKey: 'knowledge/fixture.txt' },
      { name: '__proto__', location: plan.targets['private']!, objectKey: 'knowledge/fixture.txt' },
      {
        name: 'private',
        location: plan.targets['private']!,
        objectKey: 'https://files.example.test/knowledge/fixture.txt',
      },
      {
        name: 'private',
        location: plan.targets['private']!,
        objectKey: 'knowledge/../fixture.txt',
      },
    ]) {
      await expect(plan.remove(target)).rejects.toThrow(/pinned storage target/);
    }
    expect(requests).toEqual([]);
  });

  it('includes a configured legacy bucket even when its public URL is unavailable', async () => {
    configure(await endpoint());
    vi.stubEnv('AGI_STORAGE_PUBLIC_BASE_URL', '');
    vi.stubEnv('CLOUDFLARE_R2_PUBLIC_BASE_URL', '');
    expect(Object.keys(createObjectCleanupPlan().targets)).toEqual(['private', 'legacy-public']);
    vi.stubEnv('AGI_STORAGE_BUCKET', '');
    vi.stubEnv('CLOUDFLARE_R2_BUCKET_NAME', '');
    expect(Object.keys(createObjectCleanupPlan().targets)).toEqual(['private']);
  });
});
