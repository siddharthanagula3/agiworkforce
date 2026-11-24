import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { MAX_DICTATION_BASE64_CHARS, MAX_DICTATION_MS } from '../../protocol/dictationLimits';
import { DictationAudioSchema, type DictationAudio } from '../../protocol/webviewMessages';
import { PRODUCT_COPYRIGHT_NAME, PRODUCT_NAMES } from '@agiworkforce/types';
import { isSupportedLanguage } from '@agiworkforce/i18n/languages';

const pageHtml = (preferredLanguage: string) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.code} dictation</title>
<style>
  :root { color-scheme: light dark; font: 17px system-ui, sans-serif; }
  main { max-width: 36rem; margin: 12vh auto; padding: 1rem; }
  label { display: block; margin-block: 1rem; }
  select { display: block; font: inherit; max-width: 100%; margin-top: .25rem; padding: .45rem; }
  button { font: inherit; padding: .45rem .8rem; margin-right: .5rem; }
</style>
<main>
  <h1>Dictate to ${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.code}</h1>
  <p>When you stop recording, your audio is sent to AGI Cloud for transcription. The text returns to your draft for editing.</p>
  <label for="language">Spoken language
    <select id="language" data-preferred-language="${preferredLanguage}">
      <option value="">Detect automatically</option>
    </select>
  </label>
  <button id="record">Start recording</button>
  <button id="cancel">Cancel</button>
  <p id="status" role="status"></p>
</main>
<script src="./capture.js" defer></script>
</html>`;

export async function openDictationCapturePage(
  scriptPath: string,
  open: (url: string) => PromiseLike<boolean>,
  signal: AbortSignal,
  preferredLanguage?: string,
): Promise<DictationAudio> {
  const script = await readFile(scriptPath);
  signal.throwIfAborted();
  const route = `/${randomBytes(24).toString('hex')}/`;
  return new Promise((resolve, reject) => {
    let host = '';
    let completed = false;
    let reading = false;
    const finish = (error: Error | undefined, audio?: DictationAudio) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      server.close();
      server.closeAllConnections();
      if (audio) resolve(audio);
      else reject(error);
    };
    const abort = () => finish(new Error('Dictation was cancelled.'));
    const timer = setTimeout(
      () => finish(new Error('Dictation timed out. Start another recording to try again.')),
      MAX_DICTATION_MS + 60_000,
    );
    const server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (!host || request.headers.host !== host) {
        response.writeHead(403).end();
        return;
      }
      if (request.method === 'GET' && request.url === route) {
        response
          .writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            'Permissions-Policy': 'microphone=(self), camera=()',
          })
          .end(pageHtml(isSupportedLanguage(preferredLanguage) ? preferredLanguage : ''));
        return;
      }
      if (request.method === 'GET' && request.url === `${route}capture.js`) {
        response.writeHead(200, { 'Content-Type': 'application/javascript' }).end(script);
        return;
      }
      if (request.method === 'HEAD' && request.url === route) {
        response.writeHead(204).end();
        return;
      }
      if (request.url !== route || request.headers.origin !== `http://${host}`) {
        response.writeHead(403).end();
        return;
      }
      if (request.method === 'DELETE') {
        response.writeHead(204).end(() => abort());
        return;
      }
      if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
        response.writeHead(415).end();
        return;
      }
      const limit = MAX_DICTATION_BASE64_CHARS + 256;
      const size = Number(request.headers['content-length']);
      if (!Number.isSafeInteger(size) || size < 1 || size > limit || reading) {
        response.writeHead(reading ? 409 : 413, { Connection: 'close' }).end();
        return;
      }
      reading = true;
      try {
        const chunks: Buffer[] = [];
        let received = 0;
        for await (const chunk of request) {
          const bytes = chunk as Buffer;
          received += bytes.length;
          if (received > limit) throw new Error('Recording exceeded the audio limit.');
          chunks.push(bytes);
        }
        const audio = DictationAudioSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString()));
        if (!audio.success) {
          response.writeHead(400).end();
          return;
        }
        response.writeHead(204).end(() => finish(undefined, audio.data));
      } catch {
        if (!response.destroyed) response.writeHead(400).end();
      } finally {
        reading = false;
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    server.on('error', (error) => finish(error));
    server.listen(0, '127.0.0.1', () => {
      if (completed) return;
      const address = server.address();
      if (!address || typeof address === 'string') {
        finish(new Error('Could not start the local microphone page.'));
        return;
      }
      host = `127.0.0.1:${address.port}`;
      void Promise.resolve()
        .then(() => open(`http://${host}${route}`))
        .then((opened) => {
          if (!opened) finish(new Error('Could not open the local microphone page.'));
        })
        .catch(() => finish(new Error('Could not open the local microphone page.')));
    });
  });
}
