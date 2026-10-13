import { expect, type Page, type CDPSession } from '@playwright/test';
import ts from 'typescript';
import { digest, documentInputs } from '../../../../scripts/public-runtime/proof.mjs';
import type { PublicRuntimeCase } from './public-runtime-cases';

export async function assertPublicRuntimeState(page: Page, route: PublicRuntimeCase) {
  if (route.expectedNotFoundUi)
    await expect(page.locator('[data-route-state="not-found"]')).toBeVisible();
  if (route.state === 'unavailable-artifact')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shared artifact unavailable' }),
    ).toBeVisible();
  if (route.clientMarker) await expect(page.locator(`#${route.clientMarker}`)).toBeVisible();
  if (route.state === 'unknown-device')
    await expect(page.locator('#connect-device')).toHaveCount(0);
  if (route.state === 'device-sign-in-instructions')
    await expect(page.locator('#connect-unknown')).toHaveCount(0);
  if (route.heading)
    await expect(
      page.getByRole('heading', { level: 1, name: route.heading, exact: true }),
    ).toBeVisible();
  if (route.contentMarker) {
    const content =
      route.pattern === '/plugins/[id]'
        ? page.locator('p').filter({ hasText: route.contentMarker })
        : page.getByText(route.contentMarker, { exact: true });
    await expect(content).toHaveCount(1);
    await expect(content).toBeVisible();
  }
  if (route.expectedRobots === 'noindex') {
    const directives = await page.locator('meta[name="robots" i]').evaluateAll((elements) =>
      elements.flatMap((element) =>
        (element.getAttribute('content') ?? '')
          .toLowerCase()
          .split(',')
          .map((value) => value.trim()),
      ),
    );
    expect(directives).toContain('noindex');
  }
  if (route.path === '/trial/cancel')
    await expect(
      page.getByRole('heading', { level: 1, name: 'This link has expired.' }),
    ).toBeVisible();
}

interface CoverageScript {
  scriptId: string;
  url: string;
  functions: { ranges: { startOffset: number; endOffset: number; count: number }[] }[];
}

export function clientMarkerExecution(
  script: string,
  functions: CoverageScript['functions'],
  marker: string,
) {
  const source = ts.createSourceFile(
    'served-client.js',
    script,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const owners = new Set<ts.FunctionLikeDeclaration>();
  const walk = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) && node.text === marker) {
      let parent: ts.Node | undefined = node.parent;
      let returned = false;
      while (parent && !ts.isFunctionLike(parent)) {
        if (ts.isReturnStatement(parent)) returned = true;
        parent = parent.parent;
      }
      if (parent && ts.isArrowFunction(parent) && !ts.isBlock(parent.body)) returned = true;
      if (!returned) throw new Error('Client marker was hoisted outside a render return');
      if (parent && ts.isFunctionLike(parent)) owners.add(parent as ts.FunctionLikeDeclaration);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (owners.size !== 1) throw new Error('Client state marker has no unique generated function');
  const owner = [...owners][0]!;
  if (!owner.body) throw new Error('Client state function has no body');
  const matches = functions
    .flatMap((fn) => fn.ranges.slice(0, 1))
    .filter(
      (range) =>
        range.startOffset >= owner.getStart(source) &&
        range.startOffset <= owner.body!.getStart(source) &&
        range.endOffset >= owner.body!.end &&
        range.endOffset <= owner.end &&
        range.count > 0,
    );
  if (matches.length !== 1)
    throw new Error('Client state function was not uniquely observed executing');
  return matches[0]!;
}

export async function startBrowserObservation(
  page: Page,
  route: PublicRuntimeCase,
  baseURL: string,
) {
  const origin = new URL(baseURL).origin;
  const unexpectedRequests: string[] = [];
  const httpRequests: { method: string; url: string; action: string }[] = [];
  const unsupportedTransports: string[] = [];
  await page.routeWebSocket('**/*', async (socket) => {
    unsupportedTransports.push(`WebSocket ${socket.url()}`);
    await socket.close({ code: 1008, reason: 'Unsupported sampled-state transport' });
  });
  await page.route('**/*', async (request) => {
    const url = new URL(request.request().url());
    const method = request.request().method();
    if (['data:', 'blob:'].includes(url.protocol) || url.origin === origin) {
      httpRequests.push({ method, url: url.href, action: 'continue' });
      if (!['GET', 'HEAD'].includes(method)) unsupportedTransports.push(`${method} ${url.href}`);
      return request.continue();
    }
    if (url.hostname !== 'clerk-ci.invalid') unexpectedRequests.push(url.origin);
    httpRequests.push({
      method,
      url: url.href,
      action: url.hostname === 'clerk-ci.invalid' ? 'abort-fixture' : 'abort-unexpected',
    });
    await request.abort('blockedbyclient');
  });
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Profiler.enable');
  await client.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  const documentRequests: Promise<ReturnType<typeof documentInputs>>[] = [];
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      new URL(request.url()).pathname + new URL(request.url()).search === route.path
    ) {
      documentRequests.push(
        request.allHeaders().then((headers) => documentInputs(request.url(), headers)),
      );
    }
  });
  return {
    async finish() {
      if (unexpectedRequests.length)
        throw new Error(
          `Unexpected browser HTTP origin: ${[...new Set(unexpectedRequests)].join(', ')}`,
        );
      if (unsupportedTransports.length)
        throw new Error(
          `Unsupported sampled browser transport: ${[...new Set(unsupportedTransports)].join(', ')}`,
        );
      const requests = await Promise.all(documentRequests);
      const document = requests[0];
      if (requests.length !== 1 || !document)
        throw new Error('Browser evidence needs exactly one main document navigation');
      const coverage = (await client.send('Profiler.takePreciseCoverage')) as {
        result: CoverageScript[];
      };
      let clientExecution = null;
      if (route.executionRequired && route.renderRuntime === 'browser') {
        if (!route.clientMarker)
          throw new Error('Client page needs an explicit executable state marker');
        const candidates = [];
        for (const script of coverage.result) {
          if (!script.url.startsWith(origin + '/_next/static/chunks/')) continue;
          const response = (await client.send('Debugger.getScriptSource', {
            scriptId: script.scriptId,
          })) as { scriptSource: string };
          if (!response.scriptSource.includes(route.clientMarker)) continue;
          const executed = clientMarkerExecution(
            response.scriptSource,
            script.functions,
            route.clientMarker,
          );
          candidates.push({
            url: new URL(script.url).pathname,
            scriptDigest: digest(response.scriptSource),
            ...executed,
          });
        }
        const candidate = candidates[0];
        if (candidates.length !== 1 || !candidate)
          throw new Error('Client render execution is ambiguous or absent');
        clientExecution = candidate;
      }
      await client.send('Profiler.stopPreciseCoverage');
      await client.detach();
      return {
        document,
        clientExecution,
        coverage,
        httpRequests,
        limits: [
          'Browser routing observes and filters HTTP, blocks service workers and rejects observed unsupported transports. It is not an OS sandbox or a universal browser side-effect/egress guarantee.',
        ],
      };
    },
  };
}
