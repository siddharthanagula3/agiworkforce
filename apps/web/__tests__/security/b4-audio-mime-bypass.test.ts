// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { listCanonicalModels } from '@agiworkforce/types';

const TRANSCRIPTION_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.provider === 'openai' && candidate.modelType === 'stt',
  );
  if (!model) throw new Error('Canonical transcription model fixture is missing');
  return model.id;
})();

vi.mock('server-only', () => ({}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(),
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(),
  getCorsHeaders: vi.fn(),
  getSecurityHeaders: vi.fn(),
}));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: <T extends (...a: unknown[]) => unknown>(handler: T) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

process.env['OPENAI_API_KEY'] = 'sk-test';

const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

import { getClerkAuthUser } from '@/lib/api-auth';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
import { POST } from '@/app/api/llm/v1/audio/transcriptions/route';

const TRANSCRIPTION_ENDPOINT = providerApiUrl('openai', 'audio/transcriptions');

function providerCalls(): unknown[][] {
  return fetchSpy.mock.calls.filter(([target]) => String(target) === TRANSCRIPTION_ENDPOINT);
}

function makeRequest(file: File): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('model', TRANSCRIPTION_MODEL);
  return new NextRequest('http://localhost/api/llm/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: 'Bearer fake-jwt' },
    body: fd,
  });
}

function mp3Blob(): Blob {
  const bytes = new Uint8Array(64);
  bytes[0] = 0x49;
  bytes[1] = 0x44;
  bytes[2] = 0x33;
  return new Blob([bytes]);
}

describe('B4: audio MIME + magic-bytes validation', () => {
  beforeEach(() => {
    vi.mocked(getClerkAuthUser).mockResolvedValue({ userId: 'u1', email: 'test@example.com' });
    vi.mocked(withRateLimit).mockResolvedValue(null);
    vi.mocked(handleCorsPreflightRequest).mockReturnValue(null);
    vi.mocked(getCorsHeaders).mockReturnValue({});
    vi.mocked(getSecurityHeaders).mockReturnValue({});
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ text: 'transcribed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('rejects upload with empty MIME type (was the bypass)', async () => {
    const file = new File([mp3Blob()], 'a.mp3', { type: '' });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(415);
    expect(providerCalls()).toEqual([]);
  });

  it('rejects upload with disallowed MIME type', async () => {
    const file = new File([mp3Blob()], 'a.exe', { type: 'application/x-msdownload' });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(415);
    expect(providerCalls()).toEqual([]);
  });

  it('rejects upload that has audio MIME but non-audio magic bytes', async () => {
    const pdf = new Uint8Array(64);
    pdf[0] = 0x25;
    pdf[1] = 0x50;
    pdf[2] = 0x44;
    pdf[3] = 0x46;
    const file = new File([pdf], 'a.wav', { type: 'audio/wav' });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(415);
    expect(providerCalls()).toEqual([]);
  });

  it('rejects upload exceeding 25 MiB', async () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    big[0] = 0x49;
    big[1] = 0x44;
    big[2] = 0x33;
    const file = new File([big], 'a.mp3', { type: 'audio/mpeg' });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(413);
    expect(providerCalls()).toEqual([]);
  });
});
