import { describe, expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { withErrorHandler } from '../error-handler';
import {
  DEFAULT_API_PAYLOAD_CEILING_BYTES,
  findPayloadCeilingBreach,
  payloadCeilingBytes,
} from '../payload-ceiling';

function post(path: string, contentLength: number | null): Request {
  const headers = new Headers();
  if (contentLength !== null) headers.set('content-length', String(contentLength));
  return new Request(`https://app.test${path}`, { method: 'POST', headers });
}

describe('payloadCeilingBytes', () => {
  it('gives every API path a ceiling, and the longest matching prefix wins', () => {
    expect(payloadCeilingBytes('/api/projects')).toBe(DEFAULT_API_PAYLOAD_CEILING_BYTES);
    expect(payloadCeilingBytes('/api/uploads/local-project-knowledge')).toBe(MAX_ATTACHMENT_BYTES);
    expect(payloadCeilingBytes('/api/scim/v2/Users')).toBe(256 * 1024);
    expect(payloadCeilingBytes('/api/llm/v1/chat/completions')).toBe(2_000_000);
  });
});

describe('findPayloadCeilingBreach', () => {
  it('flags a body that declares more than its route allows', () => {
    expect(findPayloadCeilingBreach(post('/api/projects', 50 * 1024 * 1024))).toMatchObject({
      ceilingBytes: DEFAULT_API_PAYLOAD_CEILING_BYTES,
    });
  });

  it('lets a legitimate attachment through on the upload route', () => {
    expect(
      findPayloadCeilingBreach(post('/api/uploads/local-project-knowledge', 20 * 1024 * 1024)),
    ).toBeNull();
  });

  it('ignores bodyless methods, non-API paths and undeclared lengths', () => {
    const get = new Request('https://app.test/api/projects', { method: 'GET' });
    expect(findPayloadCeilingBreach(get)).toBeNull();
    expect(findPayloadCeilingBreach(post('/chat', 50 * 1024 * 1024))).toBeNull();
    expect(findPayloadCeilingBreach(post('/api/projects', null))).toBeNull();
  });
});

describe('withErrorHandler enforces the ceiling before the handler runs', () => {
  it('answers 413 and never invokes the route for an oversized body', async () => {
    const handler = vi.fn(async (_request: Request) => new Response('ok'));
    const wrapped = withErrorHandler(handler);

    const response = await wrapped(post('/api/projects', 64 * 1024 * 1024));

    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('leaves a request inside its ceiling untouched', async () => {
    const handler = vi.fn(async (_request: Request) => new Response('ok'));
    const wrapped = withErrorHandler(handler);

    const response = await wrapped(post('/api/projects', 1024));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
