/**
 * /api/projects/preview tests.
 *
 * Validate the round-10 service-layer slice: pure-derivation endpoint
 * that takes a partial ProjectRecord and returns the
 * ProjectHeaderPresentation computed by the canonical summarizer.
 */

import { describe, expect, it } from 'vitest';
import { POST, GET } from './route';

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/projects/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/projects/preview', () => {
  it('returns 400 on invalid JSON', async () => {
    const req = makePostRequest('not-valid-json{');
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 when project.id is missing', async () => {
    const req = makePostRequest({ project: { name: 'no id here' } });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when project.name is missing', async () => {
    const req = makePostRequest({ project: { id: 'p1' } });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns the derived presentation for a minimal Local project', async () => {
    const req = makePostRequest({
      project: {
        id: 'p1',
        name: 'Local research',
        defaultPrivacyMode: 'local',
        defaultProviderMode: 'Local',
        allowedSurfaces: ['web', 'desktop', 'mobile'],
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presentation: Record<string, unknown> };
    expect(body.presentation['title']).toBe('Local research');
    expect(body.presentation['privacyMode']).toBe('local');
    expect(body.presentation['providerMode']).toBe('Local');
    expect(body.presentation['staysLocal']).toBe(true);
    expect(body.presentation['accentColor']).toBe('zinc');
    expect(body.presentation['surfaceChips']).toEqual(['Web', 'Desktop', 'Mobile']);
  });

  it('passes through optional fields and threads the default model label', async () => {
    const req = makePostRequest({
      project: {
        id: 'p2',
        name: 'BYOK demo',
        defaultPrivacyMode: 'byok',
        defaultProviderMode: 'DirectByok',
        iconEmoji: '💻',
        accentColor: 'sky',
        importedFrom: 'claude',
        knowledgeFileCount: 4,
        memberCount: 2,
      },
      defaultModelLabel: 'Claude Sonnet 4.6',
      lastUsedRelativeLabel: '2h ago',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presentation: Record<string, unknown> };
    expect(body.presentation['privacyMode']).toBe('byok');
    expect(body.presentation['staysLocal']).toBe(false);
    expect(body.presentation['accentColor']).toBe('sky');
    expect(body.presentation['iconEmoji']).toBe('💻');
    expect(body.presentation['importedFromLabel']).toBe('Imported from Claude');
    expect(body.presentation['knowledgeFileCountLabel']).toBe('4 files');
    expect(body.presentation['memberCountLabel']).toBe('2 members');
    expect(body.presentation['lastUsedLabel']).toBe('Last used 2h ago');
    expect(body.presentation['defaultModelLabel']).toBe('Claude Sonnet 4.6');
  });

  it('rejects negative, NaN, and Infinity counts (drops to null)', async () => {
    const req = makePostRequest({
      project: {
        id: 'p_negative',
        name: 'Bad counts',
        knowledgeFileCount: -3,
        memberCount: Number.NaN,
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presentation: Record<string, unknown> };
    // Both invalid; summarizer treats null counts as "not denormalized" and
    // omits the chip rather than rendering "-3 files".
    expect(body.presentation['knowledgeFileCountLabel']).toBeUndefined();
    expect(body.presentation['memberCountLabel']).toBeUndefined();
  });

  it('floors fractional counts (rejects fractional via floor)', async () => {
    const req = makePostRequest({
      project: { id: 'p_floor', name: 'Fractional', knowledgeFileCount: 4.7, memberCount: 2.3 },
    });
    const res = await POST(req as never);
    const body = (await res.json()) as { presentation: Record<string, unknown> };
    expect(body.presentation['knowledgeFileCountLabel']).toBe('4 files');
    expect(body.presentation['memberCountLabel']).toBe('2 members');
  });

  it('falls back to defaults for unknown enum values', async () => {
    const req = makePostRequest({
      project: {
        id: 'p3',
        name: 'Unknown enums',
        defaultPrivacyMode: 'totally-fake',
        defaultProviderMode: 'AlsoFake',
        allowedSurfaces: ['web', 'mars', 'desktop'],
        accentColor: 'turquoise',
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presentation: Record<string, unknown> };
    expect(body.presentation['privacyMode']).toBe('local');
    expect(body.presentation['providerMode']).toBe('Local');
    expect(body.presentation['accentColor']).toBe('zinc');
    // Bad surface entries are dropped; valid ones survive.
    expect(body.presentation['surfaceChips']).toEqual(['Web', 'Desktop']);
  });
});

describe('GET /api/projects/preview', () => {
  it('returns 405 with a hint', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: string; hint: string };
    expect(body.error).toBe('method_not_allowed');
    expect(body.hint).toContain('POST');
  });
});
