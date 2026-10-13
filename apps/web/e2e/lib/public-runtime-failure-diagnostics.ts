import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { digest } from '../../../../scripts/public-runtime/proof.mjs';

const fontProbeLimit = 64;
const fontBodyByteLimit = 1024 * 1024;

interface FontResponseEvidence {
  path: string;
  status: number;
  headers: Record<string, string | undefined>;
  completed: boolean | null;
  body: {
    state: 'pending' | 'complete' | 'unavailable';
    decodedBytes?: number;
    decodedDigest?: string;
    magic?: string;
    reason?: string;
  };
}

type NativeFontFaceEvidence = Pick<
  FontFace,
  'family' | 'status' | 'weight' | 'style' | 'unicodeRange'
>;

interface PublicRuntimeFailureEvidence {
  failureOnly: boolean;
  fontPolicy: string | null;
  fontFaces: NativeFontFaceEvidence[] | null;
  fontFaceCount: number | null;
  truncatedFontFaces: boolean | null;
  fontResponses: FontResponseEvidence[];
  fontFailures: { path: string; failure: string | null }[];
  consoleMessages: { type: string; text: string }[];
  dropped: number;
  fontProbes: number;
  skippedFontProbes: number;
  pendingFontProbes: number;
  limits: string[];
}

export function startPublicRuntimeFailureDiagnostics(page: Page, origin: string) {
  const fontResponses: FontResponseEvidence[] = [];
  const fontFailures: { path: string; failure: string | null }[] = [];
  const consoleMessages: { type: string; text: string }[] = [];
  const pending = new Set<Promise<void>>();
  let fontPolicy: string | null = null;
  let dropped = 0;
  let fontProbes = 0;
  let skippedFontProbes = 0;
  let active = true;
  const retain = <T>(entries: T[], entry: T) => {
    if (entries.length === 64) {
      entries.shift();
      dropped++;
    }
    entries.push(entry);
  };
  const fontRequest = (request: Request) =>
    request.resourceType() === 'font' && new URL(request.url()).origin === origin;
  const onResponse = (response: Response) => {
    if (!active) return;
    const request = response.request();
    const headers = response.headers();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      fontPolicy =
        headers['content-security-policy']
          ?.split(';')
          .map((directive) => directive.trim())
          .find((directive) => /^font-src\s/i.test(directive)) ?? null;
    if (!fontRequest(request)) return;
    if (fontProbes === fontProbeLimit) {
      skippedFontProbes++;
      return;
    }
    fontProbes++;
    const evidence: FontResponseEvidence = {
      path: new URL(response.url()).pathname,
      status: response.status(),
      headers: Object.fromEntries(
        ['content-type', 'content-length', 'content-encoding'].map((name) => [name, headers[name]]),
      ),
      completed: null,
      body: { state: 'pending' },
    };
    retain(fontResponses, evidence);
    const completion = (async () => {
      try {
        const failure = await response.finished();
        evidence.completed = failure === null;
        if (failure) {
          evidence.body = { state: 'unavailable' };
          return;
        }
        if (!active) {
          evidence.body = { state: 'unavailable', reason: 'disposed' };
          return;
        }
        const length = Number(headers['content-length']);
        const encoding = headers['content-encoding']?.toLowerCase();
        if (
          !Number.isSafeInteger(length) ||
          length < 0 ||
          length > fontBodyByteLimit ||
          (encoding && encoding !== 'identity')
        ) {
          evidence.body = { state: 'unavailable', reason: 'body-budget' };
          return;
        }
        const body = await response.body();
        evidence.body = {
          state: 'complete',
          decodedBytes: body.byteLength,
          decodedDigest: digest(body),
          magic: body.subarray(0, 4).toString('hex'),
        };
      } catch {
        evidence.body = { state: 'unavailable' };
      }
    })();
    pending.add(completion);
    void completion.finally(() => pending.delete(completion));
  };
  const onFailure = (request: Request) => {
    if (!active) return;
    if (fontRequest(request))
      retain(fontFailures, {
        path: new URL(request.url()).pathname,
        failure: request.failure()?.errorText ?? null,
      });
  };
  const onConsole = (message: ConsoleMessage) => {
    if (!active) return;
    if (
      ['warning', 'error'].includes(message.type()) &&
      /font|\bots\b|content.security.policy|\bcsp\b/i.test(message.text())
    )
      retain(consoleMessages, { type: message.type(), text: message.text().slice(0, 2048) });
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailure);
  page.on('console', onConsole);
  return {
    async capture(timeoutMilliseconds: number): Promise<PublicRuntimeFailureEvidence> {
      if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0)
        throw new Error('Failure evidence requires a positive finite timeout');
      let timer: ReturnType<typeof setTimeout> | undefined;
      let fontFaces: NativeFontFaceEvidence[] | null = null;
      let fontFaceCount: number | null = null;
      try {
        await Promise.race([
          Promise.allSettled([
            ...pending,
            (async () => {
              try {
                const observed = await page.evaluate((limit) => {
                  const faces = [];
                  for (const face of document.fonts) {
                    if (faces.length === limit) break;
                    faces.push({
                      family: face.family,
                      status: face.status,
                      weight: face.weight,
                      style: face.style,
                      unicodeRange: face.unicodeRange,
                    });
                  }
                  return { faces, count: document.fonts.size };
                }, fontProbeLimit);
                fontFaces = observed.faces;
                fontFaceCount = observed.count;
              } catch {
                fontFaces = null;
              }
            })(),
          ]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMilliseconds);
          }),
        ]);
        return structuredClone({
          failureOnly: true,
          fontPolicy,
          fontFaces,
          fontFaceCount,
          truncatedFontFaces: fontFaceCount === null ? null : fontFaceCount > fontProbeLimit,
          fontResponses,
          fontFailures,
          consoleMessages,
          dropped,
          fontProbes,
          skippedFontProbes,
          pendingFontProbes: pending.size,
          limits: [
            `At most ${fontProbeLimit} completion probes; identity bodies at most ${fontBodyByteLimit} bytes. Other bodies are unobserved.`,
            'Bounded browser font diagnostics; not a passing runtime receipt.',
          ],
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    dispose() {
      active = false;
      page.off('response', onResponse);
      page.off('requestfailed', onFailure);
      page.off('console', onConsole);
    },
  };
}
