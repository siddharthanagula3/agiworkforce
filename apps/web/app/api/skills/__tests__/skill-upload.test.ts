// @vitest-environment node
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUserScopedDb, mockQuery, mockExecute, mockCsrf } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));

import { NextRequest } from 'next/server';
import { USER_SKILL_AUTHORING_ENV_VAR } from '@/lib/services/user-skill-authoring';
import { DEFAULT_API_PAYLOAD_CEILING_BYTES } from '@/lib/payload-ceiling';
import { POST } from '../route';

const SKILLS_URL = 'http://localhost:3000/api/skills';
const BOUNDARY = 'agiworkforceskillboundary';
const CRLF = '\r\n';
const SYMLINK_MODE = 0o120777;

const SKILL_NAME = 'release-notes';
const SKILL_DESCRIPTION = 'Draft release notes from a diff.';
const SKILL_BODY = 'Summarize the diff into a changelog entry.';
const SKILL_FILE = `---\nname: ${SKILL_NAME}\ndescription: ${SKILL_DESCRIPTION}\n---\n\n${SKILL_BODY}\n`;

function multipartBody(fileName: string, bytes: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`,
  );
  const tail = encoder.encode(`${CRLF}--${BOUNDARY}--${CRLF}`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return body;
}

function uploadReq(fileName: string, bytes: Uint8Array | string): NextRequest {
  const payload = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return new NextRequest(SKILLS_URL, {
    method: 'POST',
    body: multipartBody(fileName, payload) as unknown as BodyInit,
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
}

async function skillZip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', platform: 'UNIX' });
}

function createdRow(name = SKILL_NAME): Record<string, string> {
  return {
    id: 'skill-1',
    name,
    description: SKILL_DESCRIPTION,
    body: SKILL_BODY,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env[USER_SKILL_AUTHORING_ENV_VAR] = '1';
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute },
    userId: 'user-owner',
  });
  mockCsrf.mockResolvedValue(null);
  mockQuery.mockResolvedValue([]);
  mockExecute.mockResolvedValue(1);
});

describe('POST /api/skills with an uploaded file', () => {
  it('creates the skill a SKILL.md describes, through the same owner a json draft uses', async () => {
    mockQuery.mockResolvedValueOnce([createdRow()]);
    const response = await POST(uploadReq('SKILL.md', SKILL_FILE));
    expect(response.status).toBe(201);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into user_skills');
    expect(params).toEqual(['user-owner', SKILL_NAME, SKILL_DESCRIPTION, SKILL_BODY]);
  });

  it('accepts a zip that holds exactly one SKILL.md', async () => {
    mockQuery.mockResolvedValueOnce([createdRow()]);
    const archive = await skillZip({ [`${SKILL_NAME}/SKILL.md`]: SKILL_FILE });
    const response = await POST(uploadReq('skill.zip', archive));
    expect(response.status).toBe(201);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-owner', SKILL_NAME, SKILL_DESCRIPTION, SKILL_BODY]);
  });

  it('checks csrf before reading the file', async () => {
    mockCsrf.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const response = await POST(uploadReq('SKILL.md', SKILL_FILE));
    expect(response.status).toBe(403);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a request with no file attached', async () => {
    const encoder = new TextEncoder();
    const body = encoder.encode(
      `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="other"${CRLF}${CRLF}x${CRLF}--${BOUNDARY}--${CRLF}`,
    );
    const response = await POST(
      new NextRequest(SKILLS_URL, {
        method: 'POST',
        body: body as unknown as BodyInit,
        headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      }),
    );
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a file that is not valid UTF-8 text', async () => {
    const response = await POST(uploadReq('SKILL.md', new Uint8Array([0xff, 0xfe, 0xfd])));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a markdown file with no frontmatter', async () => {
    const response = await POST(uploadReq('SKILL.md', 'Just some prose with no frontmatter.'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('frontmatter') },
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a skill name the slash menu could not address', async () => {
    const response = await POST(
      uploadReq('SKILL.md', `---\nname: Not A Slug\ndescription: d\n---\n\nbody\n`),
    );
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a zip holding no SKILL.md', async () => {
    const archive = await skillZip({ 'README.md': 'nothing here' });
    const response = await POST(uploadReq('skill.zip', archive));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('no SKILL.md') },
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a zip holding more than one skill and points at the plugin path', async () => {
    const archive = await skillZip({
      'one/SKILL.md': SKILL_FILE,
      'two/SKILL.md': SKILL_FILE.replace(SKILL_NAME, 'other-skill'),
    });
    const response = await POST(uploadReq('skill.zip', archive));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('upload the whole thing as a plugin') },
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a zip carrying a symbolic link', async () => {
    const zip = new JSZip();
    zip.file(`${SKILL_NAME}/SKILL.md`, SKILL_FILE);
    zip.file('link.md', '/etc/passwd', { unixPermissions: SYMLINK_MODE });
    const archive = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      platform: 'UNIX',
    });
    const response = await POST(uploadReq('skill.zip', archive));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('symbolic link') },
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a name a built-in skill already claims', async () => {
    const response = await POST(
      uploadReq('SKILL.md', `---\nname: code-review\ndescription: d\n---\n\nbody\n`),
    );
    expect(response.status).toBe(409);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a body over the route payload ceiling as too large', async () => {
    const response = await POST(
      uploadReq('SKILL.md', new Uint8Array(DEFAULT_API_PAYLOAD_CEILING_BYTES + 1)),
    );
    expect(response.status).toBe(413);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('leaves the json draft path untouched', async () => {
    mockQuery.mockResolvedValueOnce([createdRow()]);
    const response = await POST(
      new NextRequest(SKILLS_URL, {
        method: 'POST',
        body: JSON.stringify({
          name: SKILL_NAME,
          description: SKILL_DESCRIPTION,
          body: SKILL_BODY,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(201);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-owner', SKILL_NAME, SKILL_DESCRIPTION, SKILL_BODY]);
  });
});
