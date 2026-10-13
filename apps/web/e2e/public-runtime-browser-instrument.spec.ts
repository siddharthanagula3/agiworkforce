import { createServer, type IncomingHttpHeaders } from 'node:http';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { digest, documentInputs } from '../../../scripts/public-runtime/proof.mjs';
import { createDocumentWireCapture, startBrowserObservation } from './lib/public-runtime-browser';
import type { PublicRuntimeCase } from './lib/public-runtime-cases';

function fixtureRoute(path: string): PublicRuntimeCase {
  return {
    route: path,
    path,
    pattern: path,
    kind: 'fixed',
    sourceFiles: [__filename],
    pageType: 'utility',
    expectedHttpStatuses: [200],
    expectedFinalPath: path,
    ownership: 'public-layout',
    context: 'signed-out',
    unresolvedFlags: [],
    stateId: digest(['wire-header-fixture', path]),
    needsRuntimeProof: false,
    executionRequired: false,
    renderRuntime: 'server',
    renderSource: {
      file: __filename,
      startLine: 0,
      endLine: 0,
      sourceDigest: digest(readFileSync(__filename, 'utf8')),
    },
  };
}

const wireUrl = 'http://wire.invalid/document';
const mainFrame = 'main-frame';
const wireRequest = () => ({
  requestId: 'document-id',
  loaderId: 'document-id',
  frameId: mainFrame,
  type: 'Document',
  request: { url: wireUrl, method: 'GET' },
});
const wireHeaders = () => ({
  requestId: 'document-id',
  headers: {
    Host: 'wire.invalid',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'X-Wire-Control': 'retained',
  },
});

for (const order of ['request-first', 'extra-info-first'] as const) {
  test(`wire document joins tolerate ${order} without losing headers`, () => {
    const capture = createDocumentWireCapture(mainFrame);
    if (order === 'request-first') capture.requestWillBeSent(wireRequest());
    capture.requestWillBeSentExtraInfo(wireHeaders());
    if (order === 'extra-info-first') capture.requestWillBeSent(wireRequest());
    expect(capture.document(wireUrl)).toEqual(documentInputs(wireUrl, wireHeaders().headers));
  });
}

for (const missing of ['document', 'headers', 'matching-request-id'] as const) {
  test(`wire document evidence rejects missing ${missing}`, () => {
    const capture = createDocumentWireCapture(mainFrame);
    if (missing !== 'document') capture.requestWillBeSent(wireRequest());
    if (missing !== 'headers')
      capture.requestWillBeSentExtraInfo({
        ...wireHeaders(),
        requestId: missing === 'matching-request-id' ? 'unrelated' : 'document-id',
      });
    expect(() => capture.document(wireUrl)).toThrow(/exactly one .*record|exactly one .*request/);
  });
}

for (const duplicate of ['document', 'headers'] as const) {
  test(`wire document evidence rejects duplicate ${duplicate} records`, () => {
    const capture = createDocumentWireCapture(mainFrame);
    capture.requestWillBeSent(wireRequest());
    capture.requestWillBeSentExtraInfo(wireHeaders());
    if (duplicate === 'document') capture.requestWillBeSent(wireRequest());
    else capture.requestWillBeSentExtraInfo(wireHeaders());
    expect(() => capture.document(wireUrl)).toThrow(/exactly one .*record|exactly one .*request/);
  });
}

test('wire document identity rejects wrong frame, method, URL and resource type', () => {
  for (const change of [
    { frameId: 'child-frame' },
    { request: { url: wireUrl, method: 'POST' } },
    { request: { url: `${wireUrl}?different=1`, method: 'GET' } },
    { type: 'Fetch' },
  ]) {
    const capture = createDocumentWireCapture(mainFrame);
    capture.requestWillBeSent({ ...wireRequest(), ...change });
    capture.requestWillBeSentExtraInfo(wireHeaders());
    expect(() => capture.document(wireUrl)).toThrow('exactly one matching wire document');
  }
  expect(() => createDocumentWireCapture('')).toThrow('requires a main frame');
});

test('wire document joins do not equate opaque request and loader identifiers', () => {
  const capture = createDocumentWireCapture(mainFrame);
  const request = wireRequest();
  request.loaderId = 'separate-loader-id';
  capture.requestWillBeSent(request);
  capture.requestWillBeSentExtraInfo(wireHeaders());
  expect(capture.document(wireUrl)).toEqual(documentInputs(wireUrl, wireHeaders().headers));
});

test('wire document redirects cannot overwrite an earlier hop with the same request ID', () => {
  const capture = createDocumentWireCapture(mainFrame);
  capture.requestWillBeSent(wireRequest());
  capture.requestWillBeSentExtraInfo(wireHeaders());
  capture.requestWillBeSent({
    ...wireRequest(),
    request: { url: `${wireUrl}/final`, method: 'GET' },
    redirectResponse: { status: 302 },
  });
  capture.requestWillBeSentExtraInfo({
    ...wireHeaders(),
    headers: { ...wireHeaders().headers, 'X-Wire-Control': 'later-hop' },
  });
  expect(() => capture.document(wireUrl)).toThrow('Redirected wire document');
  expect(() => capture.document(`${wireUrl}/final`)).toThrow('Redirected wire document');
});

test('wire document evidence snapshots headers and preserves the signed-out boundary', () => {
  const capture = createDocumentWireCapture(mainFrame);
  const request = wireRequest();
  const headers = wireHeaders();
  capture.requestWillBeSent(request);
  capture.requestWillBeSentExtraInfo(headers);
  request.request.url = `${wireUrl}/mutated`;
  headers.headers['X-Wire-Control'] = 'mutated';
  expect(capture.document(wireUrl)).toEqual(documentInputs(wireUrl, wireHeaders().headers));
  for (const name of ['Cookie', 'Authorization']) {
    const authenticated = createDocumentWireCapture(mainFrame);
    authenticated.requestWillBeSent(wireRequest());
    authenticated.requestWillBeSentExtraInfo({
      ...wireHeaders(),
      headers: { ...wireHeaders().headers, [name]: 'fixture-account-context' },
    });
    expect(() => authenticated.document(wireUrl)).toThrow('requires a signed-out document');
  }
});

for (const mode of ['continue', 'override', 'iframe', 'redirect', 'repeat'] as const) {
  test(`runtime document headers match the native wire with ${mode}`, async ({ browser }) => {
    const wire: { path: string | undefined; headers: IncomingHttpHeaders }[] = [];
    const server = createServer((request, response) => {
      wire.push({ path: request.url, headers: structuredClone(request.headers) });
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/document' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><link rel="icon" href="data:,"><main>Native header fixture</main>' +
          (mode === 'iframe' && request.headers['sec-fetch-dest'] === 'document'
            ? '<iframe src="/document" title="Same URL child"></iframe>'
            : ''),
      );
    });
    const context = await browser.newContext({
      locale: 'en-US',
      serviceWorkers: 'block',
      storageState: { cookies: [], origins: [] },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture has no loopback port');
      expect([3000, 3100]).not.toContain(address.port);
      const origin = `http://127.0.0.1:${address.port}`;
      const routePath = mode === 'redirect' ? '/redirect' : '/document';
      const target = `${origin}${routePath}`;
      const page = await context.newPage();
      const observation = await startBrowserObservation(page, fixtureRoute(routePath), origin);
      if (mode === 'override') {
        await page.route(target, (route) =>
          route.fallback({
            headers: {
              ...route.request().headers(),
              'accept-language': 'fr-FR',
              'x-wire-control': 'added-by-route',
            },
          }),
        );
      }
      expect((await page.goto(target, { waitUntil: 'load' }))?.status()).toBe(200);
      if (mode === 'repeat') {
        expect((await page.reload({ waitUntil: 'load' }))?.status()).toBe(200);
        await expect(observation.finish()).rejects.toThrow('exactly one main document navigation');
        expect(
          wire.filter((request) => request.headers['sec-fetch-dest'] === 'document'),
        ).toHaveLength(2);
        return;
      }
      if (mode === 'redirect') {
        await expect(observation.finish()).rejects.toThrow('Redirected wire document evidence');
        expect(wire.map((request) => request.path)).toEqual(['/redirect', '/document']);
        return;
      }
      const result = await observation.finish();
      expect(wire).toHaveLength(mode === 'iframe' ? 2 : 1);
      const main = wire.filter((request) => request.headers['sec-fetch-dest'] === 'document');
      expect(main).toHaveLength(1);
      expect(main[0]!.path).toBe('/document');
      expect(result.document).toEqual(documentInputs(target, main[0]!.headers));
      if (mode === 'iframe') {
        expect(
          wire.filter((request) => request.headers['sec-fetch-dest'] === 'iframe'),
        ).toHaveLength(1);
        expect(page.frames()).toHaveLength(2);
      }
      for (const name of [
        'accept-encoding',
        'cache-control',
        'host',
        'pragma',
        'sec-fetch-dest',
        'sec-fetch-mode',
        'sec-fetch-site',
        'sec-fetch-user',
      ]) {
        expect(main[0]!.headers).toHaveProperty(name);
        expect(result.document.headers).toHaveProperty(name);
      }
      if (mode === 'override') {
        expect(result.document.headers['accept-language']).toBe('fr-FR');
        expect(result.document.headers['x-wire-control']).toBe('added-by-route');
      }
      expect(result.httpRequests).toContainEqual({
        method: 'GET',
        url: target,
        action: 'continue',
      });
    } finally {
      await context.close();
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
