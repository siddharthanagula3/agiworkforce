import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page, type Request } from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import { settlePublicPage } from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

const releasePath = '/api/releases/cli/latest';
const repositoryRoot = path.resolve(__dirname, '../../..');
const holdDurationMs = 5_000;
type Delivery = 'immediate' | 'delayed';
type Snapshot = {
  phase: string;
  at: number;
  requestedTop: number | null;
  requestHeld: boolean;
  heldRequestIds: number[];
  documentHeight: number;
  bodyPadding: string;
  headerHeight: number | null;
  fonts: string;
  loading: {
    present: boolean;
    role: string | null;
    label: string | null;
    ownBusy: string | null;
    pending: { attribute: string; value: string } | null;
    paintable: boolean;
    width: number | null;
    height: number | null;
  };
  release: {
    tag: string | null;
    role: string | null;
    text: string | null;
    height: number | null;
    kind: 'loading' | 'unpublished' | 'published' | 'error' | 'unknown';
  };
};
type Probe = {
  heldRequestIds: number[];
  samples: Snapshot[];
  record: (phase: string, requestedTop?: number | null) => Snapshot;
};
type ComponentState = { kind: 'unpublished' | 'published' | 'error'; version?: string };
type RequestTrace = {
  id: number;
  url: string;
  method: string;
  seenAt: number;
  interceptedAt?: number;
  upstream?: { status: number; hash: string; fetchedAt: number };
  browserResponse?: { status: number; hash?: string; at: number; readFailure?: string };
  responseReadDone: boolean;
  finishedAt?: number;
  failed?: { at: number; errorText: string | null };
  cancellationRequestId?: string;
  holdStart?: Snapshot;
  responseReady?: Snapshot;
  beforeDelivery?: Snapshot;
  heldForMs?: number;
  fulfilledAt?: number;
  handlerDone: boolean;
  handlerFailure?: string;
  probeFailure?: string;
};
type ProtocolTrace = {
  requestId: string;
  url: string;
  method: string;
  finishedAt?: number;
  failed?: { at: number; errorText: string; canceled: boolean };
};
type PrimerRequestTrace = Pick<
  RequestTrace,
  'id' | 'url' | 'method' | 'seenAt' | 'finishedAt' | 'failed'
> & {
  response?: { status: number; at: number };
};
type PrimerEvidence = {
  requests: PrimerRequestTrace[];
  protocolRequests: ProtocolTrace[];
  limitReached: boolean;
  selectedResponse?: { requestId: number | null; status: number; at: number };
  finished?: { error: string | null; at: number };
  finishedFailure?: { error: string; at: number };
  stoppedAt?: number;
  failureSnapshot?: Snapshot;
  snapshotFailure?: string;
};
type DeliveryEvidence = {
  delivery: Delivery;
  sourceStart: ReturnType<typeof sourceSnapshot>;
  sourceEnd?: ReturnType<typeof sourceSnapshot>;
  sourceUnchanged?: boolean;
  contextClosed: boolean;
  primeFailure?: string;
  primer: PrimerEvidence;
  callbackFailures: string[];
  lifecycleFailures: string[];
  consent?: ReturnType<typeof parseCookieConsentRecord>;
  requests: RequestTrace[];
  protocolRequests: ProtocolTrace[];
  completedRequestIds?: number[];
  selectedRequestId?: number;
  cancellationCount?: number;
  requestCount?: number;
  browserFinishedCount?: number;
  browserFailedCount?: number;
  expectedComponentState?: ComponentState['kind'];
  afterDelivery?: Snapshot;
  readiness?: Awaited<ReturnType<typeof settlePublicPage>>;
  readinessFailure?: string;
  experimentFailure?: string;
  sweep?: Snapshot[];
};
const sourcePaths = [
  'apps/web/app/cli/page.tsx',
  'apps/web/app/cli/CliInstallCommand.tsx',
  'apps/web/app/api/releases/cli/latest/route.ts',
  'apps/web/lib/releases/github-cli-releases.ts',
  'apps/web/lib/releases/github-desktop-releases.ts',
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/app/providers.tsx',
  'apps/web/app/BrowserIdentityBoundary.tsx',
  'apps/web/shared/lib/cookie-consent.ts',
  'apps/web/shared/components/CookieConsent.tsx',
  'apps/web/shared/components/layout/Header.tsx',
  'apps/web/features/marketing/components/system/MarketingHeader.tsx',
  'apps/web/features/marketing/components/system/HeaderScrollState.tsx',
  'apps/web/features/marketing/components/system/MarketingFooter.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/SurfaceSections.tsx',
  'apps/web/features/marketing/components/Reveal.tsx',
  'apps/web/features/marketing/components/ProductFrame.tsx',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/support/components/SupportWidgetEntry.tsx',
  'apps/web/features/support/components/SupportWidgetMount.tsx',
  'apps/web/features/support/components/SupportWidget.module.css',
  'packages/ui/ui/src/primitives/Spinner.tsx',
  'packages/ui/design-tokens/src/tailwind.css',
  'packages/ui/design-tokens/src/foundation.css',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/e2e/public-cli-readiness-attribution.spec.ts',
];

function sourceSnapshot() {
  return Object.fromEntries(
    sourcePaths.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );
}

async function within<T>(work: Promise<T>, budget: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), budget);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function installSweepProbe(page: Page) {
  await page.addInitScript(() => {
    const record = (phase: string, requestedTop: number | null = null): Snapshot => {
      const spinner = document.querySelector('[aria-label="Checking for a signed CLI release"]');
      const rect = spinner?.getBoundingClientRect();
      let paintable = Boolean(rect && rect.width > 0 && rect.height > 0);
      for (let ancestor = spinner; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        if (
          css.display === 'none' ||
          ['hidden', 'collapse'].includes(css.visibility) ||
          css.contentVisibility === 'hidden' ||
          Number(css.opacity) === 0
        )
          paintable = false;
      }
      const pending = spinner?.closest('[aria-busy="true"],[role="progressbar"]');
      const heading = document.getElementById('agi-fl-cli-install-title');
      const release = heading?.nextElementSibling?.nextElementSibling;
      const sample: Snapshot = {
        phase,
        at: performance.now(),
        requestedTop,
        requestHeld: probe.heldRequestIds.length > 0,
        heldRequestIds: [...probe.heldRequestIds],
        documentHeight: document.documentElement.scrollHeight,
        bodyPadding: document.body ? getComputedStyle(document.body).paddingBottom : '',
        headerHeight:
          document.querySelector('.agi-ds-header')?.getBoundingClientRect().height ?? null,
        fonts: document.fonts.status,
        loading: {
          present: spinner !== null,
          role: spinner?.getAttribute('role') ?? null,
          label: spinner?.getAttribute('aria-label') ?? null,
          ownBusy: spinner?.getAttribute('aria-busy') ?? null,
          pending: pending
            ? {
                attribute: pending.getAttribute('aria-busy') === 'true' ? 'aria-busy' : 'role',
                value: pending.getAttribute('aria-busy') === 'true' ? 'true' : 'progressbar',
              }
            : null,
          paintable,
          width: rect?.width ?? null,
          height: rect?.height ?? null,
        },
        release: {
          tag: release?.localName ?? null,
          role: release?.getAttribute('role') ?? null,
          text: release?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          height: release?.getBoundingClientRect().height ?? null,
          kind: spinner
            ? 'loading'
            : release?.matches('p[role="status"]')
              ? 'unpublished'
              : release?.matches('.agi-terminal')
                ? 'published'
                : release?.querySelector('button')
                  ? 'error'
                  : 'unknown',
        },
      };
      probe.samples.push(sample);
      if (probe.samples.length > 300) throw new Error('CLI sweep evidence exceeded its bound');
      return sample;
    };
    const probe: Probe = { heldRequestIds: [], samples: [], record };
    (window as typeof window & { cliReleaseSweep: Probe }).cliReleaseSweep = probe;
    const original = window.scrollTo;
    window.scrollTo = function (...args: [options?: ScrollToOptions] | [x: number, y: number]) {
      const options = args[0];
      const tracked =
        typeof options === 'object' &&
        options?.behavior === 'instant' &&
        typeof options.top === 'number';
      if (tracked) record('readiness-scroll', options.top ?? null);
      Reflect.apply(original, window, args);
    } as typeof window.scrollTo;
  });
}

async function capture(page: Page, phase: string, update?: { id: number; held: boolean }) {
  return page.evaluate(
    ({ phase, update }) => {
      const probe = (window as typeof window & { cliReleaseSweep: Probe }).cliReleaseSweep;
      if (update) {
        probe.heldRequestIds = probe.heldRequestIds.filter((id) => id !== update.id);
        if (update.held) probe.heldRequestIds.push(update.id);
      }
      return probe.record(phase);
    },
    { phase, update },
  );
}

async function waitUntil(deadline: number) {
  while (performance.now() < deadline) {
    const remaining = deadline - performance.now();
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(1, Math.ceil(remaining))));
  }
}

function componentState(status: number, body: Buffer): ComponentState {
  if (status === 404) return { kind: 'unpublished' };
  if (status < 200 || status >= 300) return { kind: 'error' };
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    const version =
      value && typeof value === 'object' ? (value as Record<string, unknown>)['version'] : null;
    if (typeof version === 'string' && version.trim()) return { kind: 'published', version };
  } catch {
    return { kind: 'error' };
  }
  return { kind: 'error' };
}

async function measureDelivery(browser: Browser, baseURL: string, delivery: Delivery) {
  const sourceStart = sourceSnapshot();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1366, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    storageState: { cookies: [], origins: [] },
  });
  const result: DeliveryEvidence = {
    delivery,
    sourceStart,
    contextClosed: false,
    primer: { requests: [], protocolRequests: [], limitReached: false },
    callbackFailures: [],
    lifecycleFailures: [],
    requests: [],
    protocolRequests: [],
  };
  const ledger = new Map<Request, RequestTrace>();
  const expectedStates = new Map<number, ComponentState>();
  const trackedWork: Promise<void>[] = [];
  let primeObserved: Promise<void> | undefined;
  let primerFinishedObserved: Promise<void> | undefined;
  let stopPrimer: (() => Promise<void>) | undefined;
  const track = (work: Promise<void>) => {
    const observed = work.catch((error: unknown) => {
      result.callbackFailures.push(error instanceof Error ? error.message : String(error));
    });
    trackedWork.push(observed);
    return observed;
  };
  const drain = async () => {
    let drained = 0;
    while (drained < trackedWork.length) {
      const batch = trackedWork.slice(drained);
      drained = trackedWork.length;
      await Promise.all(batch);
    }
  };
  const releaseUrl = new URL(releasePath, baseURL).href;
  const matches = (request: Request) => request.url() === releaseUrl && request.method() === 'GET';
  const traceFor = (request: Request) => {
    let trace = ledger.get(request);
    if (!trace) {
      trace = {
        id: ledger.size + 1,
        url: request.url(),
        method: request.method(),
        seenAt: Date.now(),
        responseReadDone: false,
        handlerDone: false,
      };
      ledger.set(request, trace);
      result.requests.push(trace);
    }
    return trace;
  };
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    await installSweepProbe(page);
    const primerLedger = new Map<Request, PrimerRequestTrace>();
    const primerTraceFor = (request: Request) => {
      let trace = primerLedger.get(request);
      if (!trace) {
        if (primerLedger.size >= 20) {
          result.primer.limitReached = true;
          return undefined;
        }
        trace = {
          id: primerLedger.size + 1,
          url: request.url(),
          method: request.method(),
          seenAt: Date.now(),
        };
        primerLedger.set(request, trace);
        result.primer.requests.push(trace);
      }
      return trace;
    };
    const primerRequest = (request: Request) => {
      if (matches(request)) primerTraceFor(request);
    };
    const primerFinished = (request: Request) => {
      if (!matches(request)) return;
      const trace = primerTraceFor(request);
      if (trace) trace.finishedAt = Date.now();
    };
    const primerFailed = (request: Request) => {
      if (!matches(request)) return;
      const trace = primerTraceFor(request);
      if (trace) trace.failed = { at: Date.now(), errorText: request.failure()?.errorText ?? null };
    };
    page.on('request', primerRequest);
    page.on('requestfinished', primerFinished);
    page.on('requestfailed', primerFailed);
    let detachPrimer: (() => Promise<void>) | undefined;
    stopPrimer = async () => {
      result.primer.stoppedAt = Date.now();
      page.off('request', primerRequest);
      page.off('requestfinished', primerFinished);
      page.off('requestfailed', primerFailed);
      await detachPrimer?.();
      stopPrimer = undefined;
    };
    if (browser.browserType().name() === 'chromium') {
      const session = await context.newCDPSession(page);
      const protocol = new Map<string, ProtocolTrace>();
      const requested = (event: {
        requestId: string;
        request: { url: string; method: string };
      }) => {
        if (event.request.url !== releaseUrl || event.request.method !== 'GET') return;
        if (result.primer.protocolRequests.length >= 20) {
          result.primer.limitReached = true;
          return;
        }
        const trace = {
          requestId: event.requestId,
          url: event.request.url,
          method: event.request.method,
        };
        protocol.set(event.requestId, trace);
        result.primer.protocolRequests.push(trace);
      };
      const finished = (event: { requestId: string }) => {
        const trace = protocol.get(event.requestId);
        if (trace) trace.finishedAt = Date.now();
      };
      const failed = (event: { requestId: string; errorText: string; canceled?: boolean }) => {
        const trace = protocol.get(event.requestId);
        if (trace)
          trace.failed = {
            at: Date.now(),
            errorText: event.errorText,
            canceled: event.canceled === true,
          };
      };
      session.on('Network.requestWillBeSent', requested);
      session.on('Network.loadingFinished', finished);
      session.on('Network.loadingFailed', failed);
      detachPrimer = async () => {
        session.off('Network.requestWillBeSent', requested);
        session.off('Network.loadingFinished', finished);
        session.off('Network.loadingFailed', failed);
        await session.detach();
      };
      await session.send('Network.enable');
    }
    const primeResponse = page.waitForResponse((response) => matches(response.request()));
    primeObserved = primeResponse.then(
      (response) => {
        const trace = primerTraceFor(response.request());
        if (trace) trace.response = { status: response.status(), at: Date.now() };
        result.primer.selectedResponse = {
          requestId: trace?.id ?? null,
          status: response.status(),
          at: Date.now(),
        };
      },
      (error: unknown) => {
        result.primeFailure = error instanceof Error ? error.message : String(error);
      },
    );
    await page.goto('/cli', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
    await expect(banner).toHaveCount(0);
    const consent = parseCookieConsentRecord(
      await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
    );
    expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
    expect(isCookieConsentCurrent(consent)).toBe(true);
    result.consent = consent;
    const primed = await within(primeResponse, 10_000, 'Initial CLI response is unmeasured');
    const primedFinished = primed.finished();
    primerFinishedObserved = primedFinished.then(
      (error) => {
        result.primer.finished = { error: error?.message ?? null, at: Date.now() };
      },
      (error: unknown) => {
        result.primer.finishedFailure = {
          error: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        };
      },
    );
    expect(await within(primedFinished, 10_000, 'Initial CLI response did not finish')).toBeNull();
    await expect(page.getByLabel('Checking for a signed CLI release', { exact: true })).toHaveCount(
      0,
    );
    await stopPrimer();
    if (browser.browserType().name() === 'chromium') {
      const session = await context.newCDPSession(page);
      const protocol = new Map<string, ProtocolTrace>();
      session.on(
        'Network.requestWillBeSent',
        (event: { requestId: string; request: { url: string; method: string } }) => {
          if (event.request.url !== releaseUrl || event.request.method !== 'GET') return;
          const trace = {
            requestId: event.requestId,
            url: event.request.url,
            method: event.request.method,
          };
          protocol.set(event.requestId, trace);
          result.protocolRequests.push(trace);
        },
      );
      session.on(
        'Network.loadingFailed',
        (event: { requestId: string; errorText: string; canceled?: boolean }) => {
          const trace = protocol.get(event.requestId);
          if (trace)
            trace.failed = {
              at: Date.now(),
              errorText: event.errorText,
              canceled: event.canceled === true,
            };
        },
      );
      await session.send('Network.enable');
    }
    page.on('request', (request) => {
      if (matches(request)) traceFor(request);
    });
    page.on('requestfinished', (request) => {
      if (matches(request)) traceFor(request).finishedAt = Date.now();
    });
    page.on('requestfailed', (request) => {
      if (!matches(request)) return;
      const trace = traceFor(request);
      trace.failed = { at: Date.now(), errorText: request.failure()?.errorText ?? null };
    });
    page.on('response', (response) => {
      if (!matches(response.request())) return;
      const trace = traceFor(response.request());
      trace.browserResponse = { status: response.status(), at: Date.now() };
      void track(
        (async () => {
          try {
            const body = await within(
              response.body(),
              10_000,
              'Browser CLI response body did not finish',
            );
            trace.browserResponse = {
              status: response.status(),
              at: trace.browserResponse?.at ?? Date.now(),
              hash: createHash('sha256').update(body).digest('hex'),
            };
            expectedStates.set(trace.id, componentState(response.status(), body));
          } catch (error) {
            if (trace.browserResponse)
              trace.browserResponse.readFailure =
                error instanceof Error ? error.message : String(error);
          } finally {
            trace.responseReadDone = true;
          }
        })(),
      );
    });
    await page.route(releaseUrl, (route) =>
      track(
        (async () => {
          const trace = traceFor(route.request());
          trace.interceptedAt = Date.now();
          try {
            if (trace.failed) return;
            trace.holdStart = await capture(page, 'request-intercepted', {
              id: trace.id,
              held: true,
            });
            const response = await route.fetch({ timeout: 10_000 });
            const body = await response.body();
            trace.upstream = {
              status: response.status(),
              hash: createHash('sha256').update(body).digest('hex'),
              fetchedAt: Date.now(),
            };
            if (trace.failed) return;
            trace.responseReady = await capture(page, 'response-held');
            const started = performance.now();
            if (delivery === 'delayed') await waitUntil(started + holdDurationMs);
            trace.heldForMs = performance.now() - started;
            if (trace.failed) return;
            trace.beforeDelivery = await capture(page, 'response-delivery', {
              id: trace.id,
              held: false,
            });
            await route.fulfill({ response });
            trace.fulfilledAt = Date.now();
          } catch (error) {
            trace.handlerFailure = error instanceof Error ? error.message : String(error);
          } finally {
            await capture(page, 'handler-complete', { id: trace.id, held: false }).catch(
              (error: unknown) => {
                trace.probeFailure = error instanceof Error ? error.message : String(error);
              },
            );
            trace.handlerDone = true;
          }
        })(),
      ),
    );
    const route = getPublicRouteInventory().routes.find((entry) => entry.path === '/cli');
    if (!route) throw new Error('CLI public-route expectation is absent');
    const destination = new URL('/cli', baseURL);
    try {
      result.readiness = await settlePublicPage(
        page,
        {
          ...route,
          expectedOrigin: destination.origin,
          expectedQuery: destination.search,
        },
        { expectedFonts: [{ cssVariable: '--font-geist-sans' }] },
      );
    } catch (error) {
      result.readinessFailure = error instanceof Error ? error.message : String(error);
    }
    await expect
      .poll(
        () =>
          result.requests.length > 0 &&
          result.requests.every(
            (trace) =>
              trace.handlerDone &&
              (trace.failed
                ? !trace.browserResponse || trace.responseReadDone
                : trace.finishedAt !== undefined && trace.responseReadDone),
          ),
        { timeout: 20_000, message: 'Native CLI terminal events and response bodies must settle' },
      )
      .toBe(true);
    const usedProtocolIds = new Set<string>();
    for (const trace of result.requests.filter((entry) => entry.failed)) {
      const candidates = result.protocolRequests.filter(
        (entry) =>
          entry.url === trace.url &&
          entry.method === trace.method &&
          entry.failed?.errorText === trace.failed?.errorText,
      );
      if (
        candidates.length === 1 &&
        candidates[0]?.failed?.canceled === true &&
        !usedProtocolIds.has(candidates[0].requestId)
      ) {
        trace.cancellationRequestId = candidates[0].requestId;
        usedProtocolIds.add(candidates[0].requestId);
      }
    }
    result.requestCount = result.requests.length;
    result.browserFinishedCount = result.requests.filter(
      (trace) => trace.finishedAt !== undefined,
    ).length;
    result.browserFailedCount = result.requests.filter(
      (trace) => trace.failed !== undefined,
    ).length;
    result.cancellationCount = usedProtocolIds.size;
    const completed = result.requests.filter(
      (trace) =>
        !trace.failed &&
        trace.finishedAt !== undefined &&
        trace.fulfilledAt !== undefined &&
        trace.browserResponse?.hash &&
        trace.responseReadDone,
    );
    result.completedRequestIds = completed.map((trace) => trace.id);
    const selected = completed.at(-1);
    if (!selected)
      throw new Error('No fulfilled browser CLI response was genuinely finished and read');
    result.selectedRequestId = selected.id;
    const state = expectedStates.get(selected.id);
    if (!state) throw new Error('Actual browser response cannot establish the final CLI state');
    result.expectedComponentState = state.kind;
    await expect(page.getByLabel('Checking for a signed CLI release', { exact: true })).toHaveCount(
      0,
    );
    result.afterDelivery = await capture(page, 'readiness-complete');
    result.sweep = await page.evaluate(
      () => (window as typeof window & { cliReleaseSweep: Probe }).cliReleaseSweep.samples,
    );
    expect(result.afterDelivery.release.kind).toBe(state.kind);
    if (state.kind === 'published')
      expect(result.afterDelivery.release.text).toContain(`agi ${state.version} ·`);
  } catch (error) {
    result.experimentFailure = error instanceof Error ? error.message : String(error);
    if (stopPrimer) {
      try {
        const page = context.pages()[0];
        if (!page) throw new Error('Primer failure has no current page');
        result.primer.failureSnapshot = await within(
          capture(page, 'primer-failure'),
          2_000,
          'Primer failure DOM snapshot did not complete',
        );
      } catch (snapshotError) {
        result.primer.snapshotFailure =
          snapshotError instanceof Error ? snapshotError.message : String(snapshotError);
      }
    }
  } finally {
    if (stopPrimer) {
      try {
        await within(stopPrimer(), 2_000, 'Primer observers did not stop');
      } catch (error) {
        result.lifecycleFailures.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      await within(drain(), 20_000, 'CLI callbacks did not drain before context closure');
    } catch (error) {
      result.lifecycleFailures.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await context.close();
      result.contextClosed = true;
    } catch (error) {
      result.lifecycleFailures.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await within(
        Promise.all([drain(), primeObserved, primerFinishedObserved]),
        10_000,
        'CLI callbacks or initial waiter did not drain after context closure',
      );
    } catch (error) {
      result.lifecycleFailures.push(error instanceof Error ? error.message : String(error));
    }
    result.sourceEnd = sourceSnapshot();
    result.sourceUnchanged =
      JSON.stringify(result.sourceStart) === JSON.stringify(result.sourceEnd);
  }
  return result;
}

test('CLI delayed live release preserves readiness and busy semantics', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('CLI readiness attribution requires a loopback site');
  }
  const report: {
    sourceStart: ReturnType<typeof sourceSnapshot>;
    sourceEnd?: ReturnType<typeof sourceSnapshot>;
    sourceUnchanged?: boolean;
    cases: DeliveryEvidence[];
    heldLoadingSweeps?: Snapshot[];
    loadingSweeps?: Snapshot[];
    limits: string[];
  } = {
    sourceStart: sourceSnapshot(),
    cases: [],
    limits: [
      'This verifies loading readiness, not the sole cause of the historical height rejections.',
      'Only the listed source owners are hashed; runtime environment and vendor availability may change.',
      'The observer records calls to the unchanged scroll implementation and computed geometry, not pixels.',
      'Cancellation attribution uses Chromium CDP native events; a failed request without that evidence is unmeasured.',
    ],
  };
  try {
    report.cases.push(await measureDelivery(browser, baseURL, 'immediate'));
    report.cases.push(await measureDelivery(browser, baseURL, 'delayed'));
    const [immediate, delayed] = report.cases;
    if (!immediate || !delayed) throw new Error('Both actual-response delivery cases are required');
    const sweep = delayed.sweep ?? [];
    report.heldLoadingSweeps = sweep.filter(
      (sample) =>
        sample.phase === 'readiness-scroll' && sample.requestHeld && sample.loading.present,
    );
    report.loadingSweeps = sweep.filter(
      (sample) => sample.phase === 'readiness-scroll' && sample.loading.present,
    );
    for (const result of report.cases) {
      expect(result.contextClosed).toBe(true);
      expect(result.sourceEnd).toEqual(result.sourceStart);
      expect(result.primeFailure, 'The initial release waiter must complete').toBeUndefined();
      expect(result.primer.limitReached, 'Primer ledger exceeded its measurement bound').toBe(
        false,
      );
      expect(
        result.callbackFailures,
        'Observed custom callback failures must remain visible',
      ).toEqual([]);
      expect(
        result.lifecycleFailures,
        'All bounded custom work must drain and the context must close',
      ).toEqual([]);
      expect(result.experimentFailure, 'Actual-response experiment must complete').toBeUndefined();
      expect(result.requestCount).toBeGreaterThan(0);
      expect(result.requestCount).toBe(result.requests.length);
      expect((result.browserFinishedCount ?? 0) + (result.browserFailedCount ?? 0)).toBe(
        result.requestCount,
      );
      expect(
        result.browserFailedCount,
        'Only independently observed cancellations may be ignored',
      ).toBe(result.cancellationCount);
      const canceled = result.protocolRequests.filter((entry) => entry.failed?.canceled === true);
      expect(canceled).toHaveLength(result.cancellationCount ?? 0);
      if (browser.browserType().name() === 'chromium') {
        expect(result.protocolRequests).toHaveLength(result.requests.length);
      }
      for (const trace of result.requests) {
        expect(trace.interceptedAt).toBeDefined();
        expect(trace.handlerDone).toBe(true);
        expect(trace.probeFailure, 'The observer must finish without failure').toBeUndefined();
        expect(
          trace.finishedAt !== undefined && trace.failed !== undefined,
          'A native request must have exactly one terminal event',
        ).toBe(false);
        if (trace.failed) {
          expect(trace.finishedAt).toBeUndefined();
          expect(
            trace.cancellationRequestId,
            'A native failure requires one matching canceled event',
          ).toBeDefined();
          const witnesses = canceled.filter(
            (entry) =>
              entry.requestId === trace.cancellationRequestId &&
              entry.url === trace.url &&
              entry.method === trace.method &&
              entry.failed?.errorText === trace.failed?.errorText,
          );
          expect(witnesses).toHaveLength(1);
          expect(
            result.requests.filter(
              (entry) => entry.cancellationRequestId === trace.cancellationRequestId,
            ),
          ).toHaveLength(1);
        } else {
          expect(
            trace.handlerFailure,
            'The fetched response must be fulfilled without an error',
          ).toBeUndefined();
          expect(trace.fulfilledAt).toBeDefined();
          expect(
            trace.finishedAt,
            'The browser must emit the native completed-request event',
          ).toBeDefined();
          expect(trace.responseReadDone).toBe(true);
          expect(trace.browserResponse?.readFailure).toBeUndefined();
          expect(
            trace.upstream,
            'The actual fetched response status and hash must be retained',
          ).toBeDefined();
          expect(
            trace.browserResponse?.hash,
            'The browser response body must actually be read',
          ).toBeDefined();
          expect(trace.browserResponse?.status).toBe(trace.upstream?.status);
          expect(trace.browserResponse?.hash).toBe(trace.upstream?.hash);
        }
      }
      expect(
        result.completedRequestIds?.length,
        'At least one fulfilled response must genuinely finish in the browser',
      ).toBeGreaterThan(0);
      expect(result.completedRequestIds).toContain(result.selectedRequestId);
      expect(result.afterDelivery?.release.kind).toBe(result.expectedComponentState);
      expect(result.afterDelivery?.loading.present).toBe(false);
    }
    const heldRequest = delayed.requests.find((trace) => trace.id === delayed.selectedRequestId);
    expect(
      heldRequest,
      'The delayed assertion must use the surviving browser request',
    ).toBeDefined();
    expect(
      heldRequest?.heldForMs,
      'Release must use an independent bounded deadline',
    ).toBeGreaterThanOrEqual(holdDurationMs);
    expect(heldRequest?.holdStart?.requestHeld).toBe(true);
    expect(heldRequest?.holdStart?.heldRequestIds).toContain(heldRequest?.id);
    expect(heldRequest?.beforeDelivery).toBeDefined();
    expect(heldRequest?.holdStart?.loading).toMatchObject({
      present: true,
      role: 'status',
      label: 'Checking for a signed CLI release',
      paintable: true,
    });
    expect(
      heldRequest?.holdStart?.loading.pending,
      'Paintable CLI loading must expose a readiness pending marker',
    ).not.toBeNull();
    expect(
      report.heldLoadingSweeps,
      'Readiness must not scroll while the actual response is held',
    ).toEqual([]);
    expect(
      report.loadingSweeps,
      'Readiness must not scroll while the actual loading Spinner remains',
    ).toEqual([]);
    expect(sweep.some((sample) => sample.phase === 'readiness-scroll')).toBe(true);
    for (const result of report.cases) {
      expect(
        result.readinessFailure,
        'Original public readiness assertions must pass',
      ).toBeUndefined();
      expect(
        result.readiness,
        'The original public readiness proof must be retained',
      ).toBeDefined();
      expect(result.readiness?.pendingControls).toEqual([]);
      expect(result.readiness?.scroll.finalHeight).toBe(result.readiness?.scroll.height);
      expect(result.afterDelivery?.fonts).toBe('loaded');
    }
  } finally {
    report.sourceEnd = sourceSnapshot();
    report.sourceUnchanged =
      JSON.stringify(report.sourceStart) === JSON.stringify(report.sourceEnd);
    await testInfo.attach('cli-readiness-loading-regression.json', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report, null, 2)),
    });
    expect(report.sourceEnd).toEqual(report.sourceStart);
  }
});
