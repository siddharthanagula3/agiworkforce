// @vitest-environment node
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { csrfMock, rateLimitMock, userScopedDbMock, storeOwnedPluginSourceMock } = vi.hoisted(
  () => ({
    csrfMock: vi.fn(),
    rateLimitMock: vi.fn(),
    userScopedDbMock: vi.fn(),
    storeOwnedPluginSourceMock: vi.fn(),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/services/plugin-owned-source-service', () => ({
  storeOwnedPluginSource: storeOwnedPluginSourceMock,
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
  UPLOAD_NO_PLUGIN_MESSAGE,
} from '@/features/plugins/server/directory/constants';
import { DEFAULT_API_PAYLOAD_CEILING_BYTES } from '@/lib/payload-ceiling';
import { POST } from '../route';

const USER_ID = 'user-1';
const UPLOAD_URL = 'http://localhost/api/plugins/uploads';
const DB = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

const INSTALLATION = {
  id: 'installation-1',
  entryId: 'entry-1',
  sourceId: 'source-1',
  pluginKey: 'my-plugin',
  installedVersion: '0.0.0',
  enabled: true,
  enabledSkills: ['summarise'],
  customExamplePrompts: null,
  installedAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

function skillFile(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

async function pluginZip(
  files: Record<string, string> = {
    'skills/summarise/SKILL.md': skillFile('summarise', 'Summarise things', 'Do it.'),
  },
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', platform: 'UNIX' });
}

const BOUNDARY = 'agiworkforceuploadboundary';
const CRLF = '\r\n';

interface MultipartPart {
  name: string;
  value?: string;
  fileName?: string;
  bytes?: Uint8Array;
}

function multipartBody(parts: readonly MultipartPart[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const disposition =
      part.fileName === undefined
        ? `form-data; name="${part.name}"`
        : `form-data; name="${part.name}"; filename="${part.fileName}"`;
    const contentType = part.fileName === undefined ? '' : `Content-Type: application/zip${CRLF}`;
    chunks.push(
      encoder.encode(
        `--${BOUNDARY}${CRLF}Content-Disposition: ${disposition}${CRLF}${contentType}${CRLF}`,
      ),
    );
    chunks.push(part.bytes ?? encoder.encode(part.value ?? ''));
    chunks.push(encoder.encode(CRLF));
  }
  chunks.push(encoder.encode(`--${BOUNDARY}--${CRLF}`));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

function uploadRequest(parts: readonly MultipartPart[]): NextRequest {
  return new NextRequest(UPLOAD_URL, {
    method: 'POST',
    body: multipartBody(parts) as unknown as BodyInit,
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
}

function archiveForm(
  bytes: Uint8Array,
  fileName = 'my-plugin.zip',
  name?: string,
): MultipartPart[] {
  const parts: MultipartPart[] = [{ name: 'file', fileName, bytes }];
  if (name !== undefined) parts.push({ name: 'name', value: name });
  return parts;
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  storeOwnedPluginSourceMock.mockResolvedValue([
    {
      entryId: 'entry-1',
      pluginKey: 'my-plugin',
      name: 'my-plugin',
      skills: ['summarise'],
      installation: INSTALLATION,
    },
  ]);
});

describe('POST /api/plugins/uploads', () => {
  it('refuses a request that fails the csrf gate before reading the body', async () => {
    csrfMock.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(uploadRequest(archiveForm(await pluginZip())));
    expect(response.status).toBe(403);
    expect(userScopedDbMock).not.toHaveBeenCalled();
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('returns the rate limiter response and writes nothing', async () => {
    rateLimitMock.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const response = await POST(uploadRequest(archiveForm(await pluginZip())));
    expect(response.status).toBe(429);
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('rate limits on the same bucket the sibling install routes use', async () => {
    await POST(uploadRequest(archiveForm(await pluginZip())));
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      'plugin-installation-write',
      `user:${USER_ID}`,
    );
  });

  it('refuses a request with no file field', async () => {
    const response = await POST(uploadRequest([{ name: 'other', value: 'x' }]));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: UPLOAD_NOT_AN_ARCHIVE_MESSAGE },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses a body over the route payload ceiling as too large, not as a bad zip', async () => {
    const oversized = new Uint8Array(DEFAULT_API_PAYLOAD_CEILING_BYTES + 1);
    const response = await POST(uploadRequest(archiveForm(oversized)));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses a declared oversize body before it reads any of it', async () => {
    const body = multipartBody(archiveForm(new Uint8Array(1)));
    const request = new NextRequest(UPLOAD_URL, {
      method: 'POST',
      body: body as unknown as BodyInit,
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        'content-length': String(DEFAULT_API_PAYLOAD_CEILING_BYTES + 1),
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('answers a rejected archive with 422 and the reason, writing nothing', async () => {
    const response = await POST(
      uploadRequest(archiveForm(await pluginZip({ 'README.md': 'nothing here' }))),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PLUGIN_UPLOAD_REJECTED', message: UPLOAD_NO_PLUGIN_MESSAGE },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('stores the plugin as an upload against the caller scoped handle', async () => {
    const response = await POST(uploadRequest(archiveForm(await pluginZip())));
    expect(response.status).toBe(201);
    expect(storeOwnedPluginSourceMock).toHaveBeenCalledWith(DB, USER_ID, {
      kind: 'upload',
      sourceName: 'my-plugin',
      plugins: [
        expect.objectContaining({
          key: 'my-plugin',
          skills: [
            expect.objectContaining({
              name: 'summarise',
              path: 'skills/summarise/SKILL.md',
              content: skillFile('summarise', 'Summarise things', 'Do it.'),
            }),
          ],
        }),
      ],
    });
    await expect(response.json()).resolves.toMatchObject({
      kind: 'upload',
      sourceName: 'my-plugin',
      plugins: [{ pluginKey: 'my-plugin', skills: ['summarise'], installation: INSTALLATION }],
    });
  });

  it('prefers the caller supplied name over the file name', async () => {
    await POST(uploadRequest(archiveForm(await pluginZip(), 'ignored.zip', 'Release notes pack')));
    expect(storeOwnedPluginSourceMock).toHaveBeenCalledWith(
      DB,
      USER_ID,
      expect.objectContaining({ sourceName: 'Release notes pack' }),
    );
  });

  it('reports the marketplace schema as unavailable rather than a server error', async () => {
    storeOwnedPluginSourceMock.mockRejectedValue(
      Object.assign(new Error('missing'), {
        code: '42P01',
      }),
    );
    const response = await POST(uploadRequest(archiveForm(await pluginZip())));
    expect(response.status).toBe(503);
  });
});
