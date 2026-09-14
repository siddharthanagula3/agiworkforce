import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DictationError,
  dictationErrorMessage,
  dictationFileName,
  transcribeDictation,
} from '../features/dictation/dictationClient';
import { setAccountToken } from '../utils/api';
import { ExtensionContext } from './__mocks__/vscode';

function secretsWithAccount(): import('vscode').SecretStorage {
  return new ExtensionContext().secrets as unknown as import('vscode').SecretStorage;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dictation transcription client', () => {
  it('refuses to record-and-send without a cloud credential', async () => {
    const secrets = secretsWithAccount();
    const fetchImpl = vi.fn();

    await expect(
      transcribeDictation(
        secrets,
        { audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm;codecs=opus' },
        fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
      ),
    ).rejects.toThrow('Sign in to AGI Cloud to use voice input.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the recording to the hosted transcription route with the account bearer', async () => {
    const secrets = secretsWithAccount();
    await setAccountToken(secrets, 'acct-token');

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: '  refactor the loader  ' }),
    }));

    const text = await transcribeDictation(
      secrets,
      {
        audio: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        mimeType: 'audio/webm;codecs=opus',
        language: 'en',
      },
      fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
    );

    expect(text).toBe('refactor the loader');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://agiworkforce.com/api/llm/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer acct-token');
    expect((init.headers as Record<string, string>)['X-AGI-Surface']).toBe('vscode');

    const form = init.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('dictation.webm');
    expect(file.type).toBe('audio/webm');
    expect(form.get('language')).toBe('en');
  });

  it('omits the language when the panel could not resolve one', async () => {
    const secrets = secretsWithAccount();
    await setAccountToken(secrets, 'acct-token');

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'hello' }),
    }));

    await transcribeDictation(
      secrets,
      { audio: new Uint8Array([1]), mimeType: 'audio/webm' },
      fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get('language')).toBeNull();
  });

  it('turns a route refusal into an honest message that names what happened', async () => {
    const secrets = secretsWithAccount();
    await setAccountToken(secrets, 'acct-token');

    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({}),
    }));

    await expect(
      transcribeDictation(
        secrets,
        { audio: new Uint8Array([1]), mimeType: 'audio/webm' },
        fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
      ),
    ).rejects.toThrow('Voice input needs an active plan. Nothing was charged for this recording.');
  });

  it('reports an empty transcript rather than inserting nothing silently', async () => {
    const secrets = secretsWithAccount();
    await setAccountToken(secrets, 'acct-token');

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: '   ' }),
    }));

    await expect(
      transcribeDictation(
        secrets,
        { audio: new Uint8Array([1]), mimeType: 'audio/webm' },
        fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
      ),
    ).rejects.toBeInstanceOf(DictationError);
  });

  it('rejects a recording larger than the route accepts before spending a request', async () => {
    const secrets = secretsWithAccount();
    await setAccountToken(secrets, 'acct-token');
    const fetchImpl = vi.fn();

    await expect(
      transcribeDictation(
        secrets,
        { audio: new Uint8Array(26 * 1024 * 1024), mimeType: 'audio/webm' },
        fetchImpl as unknown as Parameters<typeof transcribeDictation>[2],
      ),
    ).rejects.toThrow('That recording was too long to transcribe. Try a shorter one.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names the upload by the container the panel actually recorded', () => {
    expect(dictationFileName('audio/webm;codecs=opus')).toBe('dictation.webm');
    expect(dictationFileName('audio/mp4')).toBe('dictation.mp4');
    expect(dictationFileName('audio/ogg;codecs=opus')).toBe('dictation.ogg');
    expect(dictationErrorMessage(429)).toContain('Wait a moment');
  });
});
