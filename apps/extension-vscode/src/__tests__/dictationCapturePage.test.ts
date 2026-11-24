import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { openDictationCapturePage } from '../features/sidebar-webview/dictationCapturePage';

const script = fileURLToPath(new URL('../webview/dictationPage.ts', import.meta.url));
let controller: AbortController | undefined;
afterEach(() => controller?.abort());

async function start(preferredLanguage?: string) {
  controller = new AbortController();
  let publish!: (url: string) => void;
  const opened = new Promise<string>((resolve) => (publish = resolve));
  const result = openDictationCapturePage(
    script,
    async (url) => {
      publish(url);
      return true;
    },
    controller.signal,
    preferredLanguage,
  );
  void result.catch(() => {});
  return { url: await opened, result, controller };
}

describe('local dictation capture page', () => {
  it('serves the recording page and accepts one same-origin recording', async () => {
    const { url, result } = await start();
    expect(new URL(url).hostname).toBe('127.0.0.1');
    const page = await fetch(url);
    expect(page.headers.get('Permissions-Policy')).toContain('microphone=(self)');
    expect(await page.text()).toContain('Start recording');
    const response = await fetch(new URL('capture.js', url));
    expect(response.headers.get('Content-Type')).toBe('application/javascript');
    const origin = new URL(url).origin;
    const audio = { mimeType: 'audio/webm', base64: 'AQID', language: 'en-US' };
    const submit = (source: string, data: unknown, endpoint = url) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { Origin: source, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    expect((await submit('https://other.example', audio)).status).toBe(403);
    expect((await submit(origin, audio, origin)).status).toBe(403);
    expect((await submit(origin, { ...audio, mimeType: 'text/html' })).status).toBe(400);
    expect((await submit(origin, audio)).status).toBe(204);
    await expect(result).resolves.toEqual(audio);
    await expect(fetch(url)).rejects.toThrow();
  });

  it('closes the local server when the editor cancels', async () => {
    const { url, result, controller } = await start();
    controller.abort();
    await expect(result).rejects.toThrow('cancelled');
    await expect(fetch(url)).rejects.toThrow();
  });

  it('keeps the saved language in the local recorder only when it is supported', async () => {
    const preferred = await start('fr');
    expect(await (await fetch(preferred.url)).text()).toContain('data-preferred-language="fr"');
    preferred.controller.abort();
    await expect(preferred.result).rejects.toThrow('cancelled');
    const invalid = await start('"><img src=x>');
    const html = await (await fetch(invalid.url)).text();
    expect(html).toContain('data-preferred-language=""');
    expect(html).not.toContain('<img src=x>');
  });
});
