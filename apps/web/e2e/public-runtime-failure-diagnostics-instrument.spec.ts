import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { digest } from '../../../scripts/public-runtime/proof.mjs';
import { startPublicRuntimeFailureDiagnostics } from './lib/public-runtime-failure-diagnostics';

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

const validFont = readFileSync(
  resolve(__dirname, '../public/fonts/opendyslexic/OpenDyslexic-Regular.woff2'),
);

async function fontServer(body: Buffer, policy = "font-src 'self'") {
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] === '/font.woff2') {
      response.writeHead(200, {
        'content-type': 'font/woff2',
        'content-length': body.byteLength,
      });
      response.end(body);
    } else {
      response.writeHead(200, {
        'content-type': 'text/html',
        'content-security-policy': policy,
      });
      response.end('<main>Font evidence fixture</main>');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing font fixture address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function loadFont(page: Page) {
  return page.evaluate(async () => {
    const face = new FontFace('EvidenceFont', 'url(/font.woff2)');
    document.fonts.add(face);
    try {
      await face.load();
    } catch {
      return face.status;
    }
    return face.status;
  });
}

test('failure diagnostics retain complete native font bytes without asserting passing proof', async ({
  page,
}) => {
  const server = await fontServer(validFont);
  const observer = startPublicRuntimeFailureDiagnostics(page, server.origin);
  try {
    await page.goto(server.origin);
    expect(await loadFont(page)).toBe('loaded');
    const evidence = await observer.capture(1000);
    expect(evidence.failureOnly).toBe(true);
    expect(evidence.fontPolicy).toBe("font-src 'self'");
    expect(evidence.fontResponses).toHaveLength(1);
    expect(evidence.fontResponses[0]).toMatchObject({
      path: '/font.woff2',
      status: 200,
      completed: true,
      body: {
        state: 'complete',
        decodedBytes: validFont.byteLength,
        decodedDigest: digest(validFont),
        magic: '774f4632',
      },
    });
    expect(evidence.fontFaces).toContainEqual(expect.objectContaining({ status: 'loaded' }));
    expect(evidence.fontFailures).toEqual([]);
    expect(evidence.consoleMessages).toEqual([]);
    expect(evidence).not.toHaveProperty('teardownComplete');
  } finally {
    observer.dispose();
    await server.close();
  }
});

test('a complete HTTP 200 with corrupt bytes retains the native OTS warning and failed face', async ({
  page,
}) => {
  const corrupt = Buffer.from('invalid font data');
  const server = await fontServer(corrupt);
  const observer = startPublicRuntimeFailureDiagnostics(page, server.origin);
  try {
    await page.goto(server.origin);
    expect(await loadFont(page)).toBe('error');
    const evidence = await observer.capture(1000);
    expect(evidence.fontResponses[0]).toMatchObject({
      status: 200,
      completed: true,
      body: { state: 'complete', decodedBytes: corrupt.byteLength, decodedDigest: digest(corrupt) },
    });
    expect(evidence.fontFailures).toEqual([]);
    expect(evidence.fontFaces).toContainEqual(expect.objectContaining({ status: 'error' }));
    expect(evidence.consoleMessages).toContainEqual({
      type: 'warning',
      text: expect.stringMatching(/OTS parsing error.*invalid sfntVersion/i),
    });
    expect(evidence.failureOnly).toBe(true);
  } finally {
    observer.dispose();
    await server.close();
  }
});

test('font policy rejection and closed pages remain explicit failure evidence', async ({
  page,
}) => {
  const server = await fontServer(validFont, "font-src 'none'");
  const observer = startPublicRuntimeFailureDiagnostics(page, server.origin);
  try {
    await page.goto(server.origin);
    expect(await loadFont(page)).toBe('error');
    const evidence = await observer.capture(1000);
    expect(evidence.fontPolicy).toBe("font-src 'none'");
    expect(evidence.fontResponses).toEqual([]);
    expect(evidence.consoleMessages).toContainEqual({
      type: 'error',
      text: expect.stringMatching(/font-src/i),
    });
    await page.close();
    const closed = await observer.capture(1000);
    expect(closed.fontFaces).toBeNull();
    expect(closed.consoleMessages).toEqual(evidence.consoleMessages);
    await expect(observer.capture(0)).rejects.toThrow('positive finite timeout');
  } finally {
    observer.dispose();
    await server.close();
  }
});

test('native font completion probes stay bounded when a page requests more fonts', async ({
  page,
}) => {
  const server = await fontServer(validFont);
  const observer = startPublicRuntimeFailureDiagnostics(page, server.origin);
  try {
    await page.goto(server.origin);
    const loaded = await page.evaluate(async () => {
      let count = 0;
      for (let index = 0; index < 65; index++) {
        const face = new FontFace(`BoundedFont${index}`, `url(/font.woff2?probe=${index})`);
        document.fonts.add(face);
        await face.load();
        if (face.status === 'loaded') count++;
      }
      return count;
    });
    expect(loaded).toBe(65);
    const evidence = await observer.capture(1000);
    expect(evidence.fontProbes).toBe(64);
    expect(evidence.skippedFontProbes).toBe(1);
    expect(evidence.fontResponses).toHaveLength(64);
    expect(evidence.fontFaceCount).toBe(65);
    expect(evidence.fontFaces).toHaveLength(64);
    expect(evidence.truncatedFontFaces).toBe(true);
  } finally {
    observer.dispose();
    await server.close();
  }
});

test('delayed native completion evidence times out and disposal prevents deferred body reads', async ({
  page,
}) => {
  const server = await fontServer(validFont);
  let releaseCompletion: ((value: Error | null) => void) | undefined;
  const completion = new Promise<Error | null>((resolve) => {
    releaseCompletion = resolve;
  });
  let bodyReads = 0;
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'font') return;
    response.finished = () => completion;
    const body = response.body.bind(response);
    response.body = async () => {
      bodyReads++;
      return body();
    };
  });
  const observer = startPublicRuntimeFailureDiagnostics(page, server.origin);
  try {
    await page.goto(server.origin);
    expect(await loadFont(page)).toBe('loaded');
    const started = Date.now();
    const evidence = await observer.capture(1000);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(evidence.pendingFontProbes).toBe(1);
    expect(evidence.fontFaces).toContainEqual(expect.objectContaining({ status: 'loaded' }));
    expect(evidence.fontResponses[0]?.body.state).toBe('pending');
    const retained = JSON.stringify(evidence);
    observer.dispose();
    releaseCompletion?.(null);
    const disposed = await observer.capture(1000);
    expect(bodyReads).toBe(0);
    expect(disposed.fontResponses[0]?.body).toEqual({ state: 'unavailable', reason: 'disposed' });
    expect(JSON.stringify(evidence)).toBe(retained);
  } finally {
    observer.dispose();
    releaseCompletion?.(null);
    await server.close();
  }
});
