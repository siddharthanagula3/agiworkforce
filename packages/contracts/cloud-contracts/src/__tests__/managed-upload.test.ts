import { afterEach, describe, expect, it, vi } from 'vitest';
import { managedUploadRequestOptions } from '../managed-upload';

afterEach(() => vi.unstubAllGlobals());

describe('managed upload credential boundary', () => {
  it.each([
    'https://storage.example/object?signature=fixture',
    'https://cloud.example:444/api/upload',
    'https://cloud.example.attacker.example/api/upload',
    'https://other.cloud.example/api/upload',
  ])('keeps account headers off %s', async (url) => {
    const getHeaders = vi.fn(() => ({ Authorization: 'Bearer account' }));
    const decorateMutationHeaders = vi.fn((headers: Headers) => headers);
    await expect(
      managedUploadRequestOptions(
        url,
        { 'Content-Type': 'text/plain' },
        {
          baseUrl: 'https://cloud.example',
          getHeaders,
          decorateMutationHeaders,
        },
      ),
    ).resolves.toEqual({ headers: { 'content-type': 'text/plain' } });
    expect(getHeaders).not.toHaveBeenCalled();
    expect(decorateMutationHeaders).not.toHaveBeenCalled();
  });

  it.each([
    'https://user:password@cloud.example/api/upload',
    'http://remote.example/object',
    'file:///private/upload',
  ])('refuses an insecure upload target %s', async (url) => {
    const getHeaders = vi.fn(() => ({ Authorization: 'Bearer account' }));
    await expect(
      managedUploadRequestOptions(url, {}, { baseUrl: 'https://cloud.example', getHeaders }),
    ).rejects.toThrow('insecure upload');
    expect(getHeaders).not.toHaveBeenCalled();
  });

  it('preserves the same-origin web HTTP upload contract', async () => {
    vi.stubGlobal('location', new URL('http://web-dev.example/chat'));
    await expect(
      managedUploadRequestOptions('http://web-dev.example/api/upload', {}, {}),
    ).resolves.toMatchObject({ credentials: 'include' });
  });

  it('uses current identity and CSRF headers while preserving the file content type', async () => {
    const result = await managedUploadRequestOptions(
      'https://cloud.example/api/upload?token=fixture',
      {
        Authorization: 'Bearer stale',
        'Content-Type': 'text/plain',
        'x-csrf-token': '',
      },
      {
        baseUrl: 'https://cloud.example',
        getHeaders: () => ({ Authorization: 'Bearer current', 'Content-Type': 'application/json' }),
        decorateMutationHeaders: (headers) => {
          headers.set('x-csrf-token', 'current-csrf');
          return headers;
        },
      },
    );
    expect(result).toEqual({
      headers: {
        authorization: 'Bearer current',
        'content-type': 'text/plain',
        'x-csrf-token': 'current-csrf',
      },
      credentials: 'include',
      redirect: 'error',
    });
  });

  it.each(['', '/proxy'])(
    'resolves a web API origin from its configured relative base %j',
    async (baseUrl) => {
      vi.stubGlobal('location', new URL('https://cloud.example/chat'));
      const result = await managedUploadRequestOptions(
        'https://cloud.example/api/upload',
        {},
        { baseUrl, getHeaders: () => ({ Authorization: 'Bearer web' }) },
      );
      expect(result.headers['authorization']).toBe('Bearer web');
      expect(result.credentials).toBe('include');
    },
  );

  it('does not infer a trusted API origin in a headless client without a base', async () => {
    vi.stubGlobal('location', undefined);
    const getHeaders = vi.fn(() => ({ Authorization: 'Bearer account' }));
    const result = await managedUploadRequestOptions(
      'https://cloud.example/api/upload',
      {},
      { getHeaders },
    );
    expect(result).toEqual({ headers: {} });
    expect(getHeaders).not.toHaveBeenCalled();
  });

  it('does not authenticate a base URL with embedded credentials', async () => {
    const getHeaders = vi.fn(() => ({ Authorization: 'Bearer account' }));
    await managedUploadRequestOptions(
      'https://cloud.example/api/upload',
      {},
      { baseUrl: 'https://user:password@cloud.example', getHeaders },
    );
    expect(getHeaders).not.toHaveBeenCalled();
  });

  it('does not label raw multipart bytes as a JSON API body', async () => {
    const result = await managedUploadRequestOptions(
      'https://cloud.example/api/upload',
      {},
      {
        baseUrl: 'https://cloud.example',
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    );
    expect(new Headers(result.headers).has('Content-Type')).toBe(false);
  });

  it('propagates an account change instead of using stale request headers', async () => {
    await expect(
      managedUploadRequestOptions(
        'https://cloud.example/api/upload',
        {},
        {
          baseUrl: 'https://cloud.example',
          getHeaders: () => {
            throw new Error('Account changed');
          },
        },
      ),
    ).rejects.toThrow('Account changed');
  });
});
