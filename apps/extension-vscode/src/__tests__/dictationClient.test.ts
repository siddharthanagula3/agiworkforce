import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeDictation } from '../features/sidebar-webview/dictationClient';
import { DictationAudioSchema } from '../protocol/webviewMessages';

afterEach(() => vi.unstubAllGlobals());

describe('AGI Code dictation transport', () => {
  const audio = { mimeType: 'audio/webm', base64: 'AQID', language: 'en-US' };
  it('submits permitted audio to the managed transcription endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: ' hello ' })));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await expect(
      transcribeDictation('https://agiworkforce.com', 'qa-test', audio, signal),
    ).resolves.toBe('hello');
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url.href).toBe('https://agiworkforce.com/api/voice/transcribe?surface=vscode');
    expect(request.headers.Authorization).toBe('Bearer qa-test');
    expect(request.signal).toBe(signal);
    expect(request.body.get('language')).toBe('en');
    expect(request.body.get('file').type).toBe('audio/webm');
    expect(request.body.get('file').size).toBe(3);
    expect(request.body.get('model')).toEqual(expect.any(String));
  });
  it('does not turn provider refusal into a transcript', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(
      transcribeDictation(
        'https://agiworkforce.com',
        'qa-test',
        audio,
        new AbortController().signal,
      ),
    ).rejects.toThrow('403');
  });
  it('omits the language hint in automatic mode', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' })));
    vi.stubGlobal('fetch', fetcher);
    await transcribeDictation(
      'https://agiworkforce.com',
      'qa-test',
      { mimeType: 'audio/webm', base64: 'AQID' },
      new AbortController().signal,
    );
    expect(fetcher.mock.calls[0]?.[1].body.has('language')).toBe(false);
  });
  it('rejects non-audio and invalid wire encodings', () => {
    expect(DictationAudioSchema.safeParse({ ...audio }).success).toBe(true);
    expect(DictationAudioSchema.safeParse({ ...audio, mimeType: 'text/html' }).success).toBe(false);
    expect(DictationAudioSchema.safeParse({ ...audio, base64: 'data:abc' }).success).toBe(false);
  });
});
