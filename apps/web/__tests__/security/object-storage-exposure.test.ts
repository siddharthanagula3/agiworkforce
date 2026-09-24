import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const USER_ID = 'user_object_storage_exposure';
const PROJECT_ID = 'project-object-storage-exposure';

const uploads = vi.hoisted(() => ({
  publicBucket: vi.fn(async (params: { key: string }) => ({
    uploadUrl: `https://objects.example.test/${params.key}`,
    publicUrl: `https://assets.example.test/${params.key}`,
  })),
  privateBucket: vi.fn(async (params: { key: string }) => ({
    uploadUrl: `https://objects.example.test/private/${params.key}`,
  })),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(async () => [{ id: PROJECT_ID }]) },
    userId: USER_ID,
    organizationId: null,
  })),
}));
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/object-storage')>()),
  isObjectStorageConfigured: () => true,
  isPrivateObjectStorageConfigured: () => true,
  getPresignedUploadUrl: uploads.publicBucket,
  getPresignedPrivateUploadUrl: uploads.privateBucket,
}));
vi.mock('@/lib/server/object-storage-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/object-storage-runtime')>();
  return {
    ...original,
    objectStorageConfig: () => ({
      ...original.objectStorageConfig(),
      secretAccessKey: 'object-storage-exposure-fixture-material',
    }),
  };
});

import { PRESIGNED_URL_MAX_TTL_SECONDS } from '@agiworkforce/object-storage';
import { POST as presign } from '@/app/api/uploads/presign/route';
import {
  createProjectKnowledgeUploadAuthorization,
  verifyProjectKnowledgeUploadAuthorization,
} from '@/lib/server/project-knowledge-object-storage';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  '__tests__',
  '__mocks__',
  'e2e',
  'src-tauri',
]);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const NOT_PRODUCTION = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SIGNER = /\bgetSignedUrl\s*\(|s3-request-presigner/;
const OBJECT_STORE_SOURCE = 'packages/platform/object-storage/src';
const WEB_STORAGE_MODULE = 'apps/web/lib/server/object-storage.ts';
const PRESIGN_ROUTE = 'apps/web/app/api/uploads/presign/route.ts';
const MILLISECONDS_PER_SECOND = 1_000;

function productionFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(REPO_ROOT, root));
  return out;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

function bodyOpen(source: string, start: number): number {
  let parens = 0;
  let angles = 0;
  let seenParams = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') {
      parens++;
      seenParams = true;
    } else if (ch === ')') parens--;
    else if (parens === 0 && seenParams) {
      if (ch === '<') angles++;
      else if (ch === '>') angles = Math.max(0, angles - 1);
      else if (ch === '{' && angles === 0) return i;
      else if (ch === ';' && angles === 0) return -1;
    }
  }
  return -1;
}

function methodBody(source: string, start: number): string {
  const open = bodyOpen(source, start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

function exportedFunctionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    bodies.set(match[1]!, methodBody(source, match.index));
  }
  return bodies;
}

function presignRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/uploads/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const REQUEST_FOR_KIND: Record<string, Record<string, unknown>> = {
  avatar: { fileName: 'portrait.png', mimeType: 'image/png', byteCount: 2_048 },
  'chat-attachment': { fileName: 'brief.pdf', mimeType: 'application/pdf', byteCount: 4_096 },
  'knowledge-file': {
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    byteCount: 512,
    projectId: PROJECT_ID,
    checksumSha256: 'a'.repeat(64),
  },
};

function presignKinds(): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, PRESIGN_ROUTE), 'utf8');
  const declared = /kind:\s*z\.enum\(\[([^\]]+)\]\)/.exec(source);
  return [...(declared?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe('no signed object URL is permanent', () => {
  it('signs object URLs in exactly one place, the object store adapter', () => {
    const signers = ['apps', 'packages']
      .flatMap(productionFiles)
      .filter((file) => SIGNER.test(fs.readFileSync(file, 'utf8')))
      .map(rel);
    expect(signers).toEqual([`${OBJECT_STORE_SOURCE}/adapters/s3.ts`]);
  });

  it('binds every presigning implementation to the lifetime ceiling before it signs', () => {
    const implementations: string[] = [];
    for (const file of productionFiles(OBJECT_STORE_SOURCE)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/presignPut\s*\(\s*input\s*:\s*PresignPutInput\s*\)/g)) {
        const body = methodBody(source, match.index);
        if (!body) continue;
        implementations.push(rel(file));
        const delegates = /\bstore\.presignPut\(input\)/.test(body);
        const binds = /\bbindPresignedUpload\(input\)/.test(body);
        expect(delegates || binds, `${rel(file)} presigns without binding a lifetime`).toBe(true);
        if (SIGNER.test(body)) {
          expect(body, `${rel(file)} signs with a lifetime it did not bind`).toMatch(
            /expiresIn:\s*bound\.expiresInSeconds/,
          );
        }
      }
    }
    expect(implementations.length).toBeGreaterThanOrEqual(3);
  });

  describe('an upload authorization carried in a URL', () => {
    const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires within the presign ceiling and is refused once it has', async () => {
      const token = await createProjectKnowledgeUploadAuthorization({
        userId: USER_ID,
        key: `knowledge-files/projects/${PROJECT_ID}/1_notes.txt`,
        contentType: 'text/plain',
        byteCount: 512,
        checksumSha256: 'b'.repeat(64),
      });

      const claims = await verifyProjectKnowledgeUploadAuthorization(token, USER_ID);
      expect(claims.expiresAt).toBeGreaterThan(NOW);
      expect(claims.expiresAt - NOW).toBeLessThanOrEqual(
        PRESIGNED_URL_MAX_TTL_SECONDS * MILLISECONDS_PER_SECOND,
      );

      vi.setSystemTime(claims.expiresAt + 1);
      await expect(verifyProjectKnowledgeUploadAuthorization(token, USER_ID)).rejects.toThrow(
        /expired/,
      );
    });
  });
});

describe('the public bucket holds avatars and nothing else', () => {
  beforeEach(() => {
    uploads.publicBucket.mockClear();
    uploads.privateBucket.mockClear();
  });

  it('is written through one route in the whole web app', () => {
    const storage = fs.readFileSync(path.join(REPO_ROOT, WEB_STORAGE_MODULE), 'utf8');
    const writers = [...exportedFunctionBodies(storage)]
      .filter(
        ([, body]) =>
          /publicBucketName\(\)/.test(body) &&
          /\b(?:putObjectInBucket|presignUploadForBucket)\(/.test(body),
      )
      .map(([name]) => name);
    expect(writers.length).toBeGreaterThan(0);

    const callers: Record<string, string[]> = {};
    for (const file of productionFiles('apps/web')) {
      const relative = rel(file);
      if (relative === WEB_STORAGE_MODULE) continue;
      const source = withoutComments(fs.readFileSync(file, 'utf8'));
      const called = writers.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(source));
      if (called.length > 0) callers[relative] = called;
    }
    expect(callers).toEqual({ [PRESIGN_ROUTE]: ['getPresignedUploadUrl'] });
  });

  it('sends every upload kind but the avatar to the private bucket', async () => {
    const kinds = presignKinds();
    expect(kinds).toContain('avatar');
    expect(kinds.length).toBeGreaterThan(1);

    for (const kind of kinds) {
      const shape = REQUEST_FOR_KIND[kind];
      expect(shape, `no request shape for the ${kind} upload kind`).toBeDefined();
      uploads.publicBucket.mockClear();
      uploads.privateBucket.mockClear();

      const response = await presign(presignRequest({ kind, ...shape }));
      expect(response.status, kind).toBe(200);

      if (kind === 'avatar') {
        expect(uploads.privateBucket).not.toHaveBeenCalled();
        expect(uploads.publicBucket).toHaveBeenCalledTimes(1);
        const [params] = uploads.publicBucket.mock.calls[0]!;
        expect(params.key.startsWith(`avatars/${USER_ID}/`)).toBe(true);
      } else {
        expect(uploads.publicBucket, kind).not.toHaveBeenCalled();
        expect(uploads.privateBucket, kind).toHaveBeenCalledTimes(1);
      }
    }
  });
});
