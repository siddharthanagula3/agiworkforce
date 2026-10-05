import type { JSHandle, Page } from '@playwright/test';
import {
  scanPublicTypography,
  type PublicTypographyIssue,
  type PublicTypographyOptions,
  type PublicTypographyReport,
  type PublicTypographySample,
} from './public-typography';

export type PublicTypographyScrollOptions = { maximumStates?: number };

export type PublicTypographyScrollState = {
  index: number;
  requested: { key: string; elementIndex: number; x: number; y: number }[];
  actual: { key: string; x: number; y: number }[];
  window: { x: number; y: number };
  domStable: boolean;
  report: PublicTypographyReport;
};

export type PublicTypographyWithScrollReport = PublicTypographyReport & {
  scrollProof: {
    maximumStates: number;
    plannedStates: number;
    planComplete: boolean;
    states: PublicTypographyScrollState[];
    sources: (PublicTypographyReport['scrollCoverage'][number] & { complete: boolean })[];
    initialWindow: { x: number; y: number };
    restored: boolean;
    restorationFailures: string[];
  };
};

type Port = PublicTypographyReport['scrollContainers'][number];
type Request = PublicTypographyScrollState['requested'][number];
type Identity = { elements: Element[]; texts: Text[] };

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((left, right) => left[0] - right[0])) {
    const previous = result[result.length - 1];
    if (previous && previous[1] >= start) previous[1] = Math.max(previous[1], end);
    else result.push([start, end]);
  }
  return result;
}

function rangesCovered(required: [number, number][], observed: [number, number][]): boolean {
  return (
    required.length > 0 &&
    required.every(([start, end]) => observed.some(([low, high]) => low <= start && high >= end))
  );
}

function issueKey(item: PublicTypographyIssue): string {
  return JSON.stringify([
    item.kind,
    item.sourceKey,
    item.selector,
    item.text,
    item.actual,
    item.expected,
  ]);
}

function portSignature(port: Port): string {
  return JSON.stringify([
    port.key,
    port.selector,
    port.elementIndex,
    port.minX,
    port.maxX,
    port.minY,
    port.maxY,
    port.viewport.width,
    port.viewport.height,
  ]);
}

export async function measurePublicTypographyWithScroll(
  page: Page,
  options: PublicTypographyOptions,
  settings: PublicTypographyScrollOptions = {},
): Promise<PublicTypographyWithScrollReport> {
  const maximumStates = settings.maximumStates ?? 256;
  if (!Number.isSafeInteger(maximumStates) || maximumStates < 1)
    throw new RangeError('maximumStates must be a positive integer');
  const initialWindow = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  let identity: JSHandle<Identity> | undefined;
  let initial: PublicTypographyReport | undefined;
  let originalPorts: Port[] = [];
  const states: PublicTypographyScrollState[] = [];
  const extraIssues: PublicTypographyIssue[] = [];
  const restorationFailures: string[] = [];
  let plannedStates = 1;
  let planComplete = true;
  let restored = false;
  const addIssue = (
    kind: string,
    text = '',
    sourceKey?: string,
    expected?: string,
    actual?: number,
  ) => extraIssues.push({ kind, selector: 'body', text, sourceKey, expected, actual });
  const domStable = async () =>
    identity!.evaluate((original) => {
      const elements = [...document.querySelectorAll('*')];
      const texts: Text[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      return (
        elements.length === original.elements.length &&
        elements.every((element, index) => element === original.elements[index]) &&
        texts.length === original.texts.length &&
        texts.every((text, index) => text === original.texts[index])
      );
    });
  try {
    identity = await page.evaluateHandle(() => {
      const texts: Text[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      return { elements: [...document.querySelectorAll('*')], texts };
    });
    initial = await page.evaluate(scanPublicTypography, options);
    originalPorts = initial.scrollContainers;
    const initialStable = await domStable();
    states.push({
      index: 0,
      requested: originalPorts.map((port) => ({
        key: port.key,
        elementIndex: port.elementIndex,
        x: port.x,
        y: port.y,
      })),
      actual: originalPorts.map((port) => ({ key: port.key, x: port.x, y: port.y })),
      window: initialWindow,
      domStable: initialStable,
      report: initial,
    });
    if (!initialStable) {
      addIssue('scroll-dom-index-drift');
      originalPorts = [];
    }
    const metrics = await identity.evaluate(
      (original, ports) =>
        ports.map((port) => {
          const element = original.elements[port.elementIndex];
          return {
            key: port.key,
            clientWidth: element?.clientWidth ?? 0,
            clientHeight: element?.clientHeight ?? 0,
            ancestorKeys: ports
              .filter(
                (ancestor) =>
                  ancestor.key !== port.key &&
                  original.elements[ancestor.elementIndex]?.contains(element!),
              )
              .map((ancestor) => ancestor.key),
          };
        }),
      originalPorts,
    );
    const metricByKey = new Map(metrics.map((metric) => [metric.key, metric]));
    let axisTruncated = false;
    const positions = (minimum: number, maximum: number, current: number, extent: number) => {
      const result = new Set([minimum, maximum, current]);
      if (maximum > minimum) {
        if (!Number.isFinite(extent) || extent <= 0)
          addIssue('unmeasurable-scrollport', '', undefined, 'positive client width and height');
        else {
          const stride = extent * 0.75;
          let position = minimum + stride;
          let count = 0;
          while (position < maximum) {
            result.add(position);
            count += 1;
            if (count > maximumStates) {
              axisTruncated = true;
              break;
            }
            position += stride;
          }
        }
      }
      return [...result].sort((left, right) => left - right);
    };
    const positionByKey = new Map(
      originalPorts.map((port) => {
        const metric = metricByKey.get(port.key)!;
        const horizontal = positions(port.minX, port.maxX, port.x, metric.clientWidth);
        const vertical = positions(port.minY, port.maxY, port.y, metric.clientHeight);
        return [port.key, { horizontal, vertical }] as const;
      }),
    );
    const leaves = originalPorts.filter(
      (port) => !metrics.some((metric) => metric.ancestorKeys.includes(port.key)),
    );
    const chains = leaves.map((port) =>
      [...metricByKey.get(port.key)!.ancestorKeys, port.key].sort(
        (left, right) =>
          metricByKey.get(left)!.ancestorKeys.length - metricByKey.get(right)!.ancestorKeys.length,
      ),
    );
    const originalRequests = originalPorts.map((port) => ({
      key: port.key,
      elementIndex: port.elementIndex,
      x: port.x,
      y: port.y,
    }));
    const plan: Request[][] = [];
    const seen = new Set([JSON.stringify(originalRequests.map(({ key, x, y }) => [key, x, y]))]);
    let budgetReached = false;
    const addPlan = (assignment: Map<string, { x: number; y: number }>) => {
      const request = originalRequests.map((port) => ({ ...port, ...assignment.get(port.key) }));
      const key = JSON.stringify(request.map(({ key, x, y }) => [key, x, y]));
      if (seen.has(key)) return;
      seen.add(key);
      plannedStates += 1;
      if (plannedStates > maximumStates) {
        budgetReached = true;
        return;
      }
      plan.push(request);
    };
    const combinations = (
      chain: string[],
      index: number,
      assignment: Map<string, { x: number; y: number }>,
    ) => {
      if (budgetReached) return;
      const key = chain[index];
      if (!key) {
        addPlan(assignment);
        return;
      }
      const positions = positionByKey.get(key)!;
      for (const x of positions.horizontal) {
        for (const y of positions.vertical) {
          assignment.set(key, { x, y });
          combinations(chain, index + 1, assignment);
          if (budgetReached) return;
        }
      }
      assignment.delete(key);
    };
    for (const chain of chains) {
      combinations(chain, 0, new Map());
      if (budgetReached) break;
    }
    planComplete = !budgetReached && !axisTruncated;
    if (!planComplete)
      addIssue(
        'scroll-state-budget',
        '',
        undefined,
        `complete sweep within ${maximumStates} states`,
        Math.max(plannedStates, maximumStates + 1),
      );
    const portSignatures = new Map(originalPorts.map((port) => [port.key, portSignature(port)]));
    if (initialStable) {
      for (const requested of plan) {
        if (!(await domStable())) {
          addIssue('scroll-dom-index-drift');
          break;
        }
        const settled = await page.evaluate(async (requests) => {
          const elements = [...document.querySelectorAll('*')];
          for (const request of requests)
            elements[request.elementIndex]!.scrollTo({
              left: request.x,
              top: request.y,
              behavior: 'instant',
            });
          let previous = '';
          let stable = 0;
          for (let frame = 0; frame < 8; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const current = JSON.stringify(
              requests.map((request) => [
                elements[request.elementIndex]!.scrollLeft,
                elements[request.elementIndex]!.scrollTop,
              ]),
            );
            stable = current === previous ? stable + 1 : 0;
            previous = current;
            if (stable >= 2) return true;
          }
          return false;
        }, requested);
        if (!settled) addIssue('scroll-state-not-settled');
        const report = await page.evaluate(scanPublicTypography, options);
        const stable = await domStable();
        const currentWindow = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        states.push({
          index: states.length,
          requested,
          actual: report.scrollContainers.map((port) => ({ key: port.key, x: port.x, y: port.y })),
          window: currentWindow,
          domStable: stable,
          report,
        });
        if (!stable) {
          addIssue('scroll-dom-index-drift');
          break;
        }
        if (
          report.scrollContainers.length !== originalPorts.length ||
          report.scrollContainers.some(
            (port) => portSignatures.get(port.key) !== portSignature(port),
          )
        ) {
          addIssue('scrollport-topology-drift');
          break;
        }
      }
    }
  } finally {
    if (identity) {
      try {
        const failures = await identity.evaluate(
          async (original, restore) => {
            const failures: string[] = [];
            for (const port of restore.ports) {
              const element = original.elements[port.elementIndex];
              if (!element?.isConnected) {
                failures.push(`${port.key}:detached`);
                continue;
              }
              element.scrollTo({ left: port.x, top: port.y, behavior: 'instant' });
            }
            window.scrollTo({ left: restore.window.x, top: restore.window.y, behavior: 'instant' });
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
            for (const port of restore.ports) {
              const element = original.elements[port.elementIndex];
              if (
                element?.isConnected &&
                (Math.abs(element.scrollLeft - port.x) > 1 ||
                  Math.abs(element.scrollTop - port.y) > 1)
              )
                failures.push(`${port.key}:position`);
            }
            if (
              Math.abs(scrollX - restore.window.x) > 1 ||
              Math.abs(scrollY - restore.window.y) > 1
            )
              failures.push('window:position');
            return failures;
          },
          { ports: originalPorts, window: initialWindow },
        );
        restorationFailures.push(...failures);
      } catch (error) {
        restorationFailures.push(error instanceof Error ? error.message : String(error));
      }
      await identity.dispose();
    }
    restored = restorationFailures.length === 0;
  }
  if (!initial) throw new Error('Initial typography scan did not complete');
  const sources = new Map<
    string,
    PublicTypographyReport['scrollCoverage'][number] & { complete: boolean }
  >();
  const driftedKeys = new Set<string>();
  for (const state of states) {
    for (const source of state.report.scrollCoverage) {
      const existing = sources.get(source.sourceKey);
      if (
        existing &&
        (existing.sourceText !== source.sourceText ||
          JSON.stringify([...existing.containerKeys].sort()) !==
            JSON.stringify([...source.containerKeys].sort()))
      ) {
        driftedKeys.add(source.sourceKey);
        addIssue(
          'scroll-source-drift',
          source.sourceText,
          source.sourceKey,
          'stable sourceText and containerKeys',
        );
        continue;
      }
      if (existing) {
        existing.requiredRanges = mergeRanges([
          ...existing.requiredRanges,
          ...source.requiredRanges,
        ]);
        existing.visibleRanges = mergeRanges([...existing.visibleRanges, ...source.visibleRanges]);
      } else
        sources.set(source.sourceKey, {
          ...source,
          requiredRanges: mergeRanges(source.requiredRanges),
          visibleRanges: mergeRanges(source.visibleRanges),
          complete: false,
        });
    }
  }
  for (const source of sources.values()) {
    source.complete =
      !driftedKeys.has(source.sourceKey) &&
      states.every((state) => state.domStable) &&
      rangesCovered(source.requiredRanges, source.visibleRanges);
    if (!source.complete)
      addIssue(
        'incomplete-scroll-coverage',
        source.sourceText,
        source.sourceKey,
        'every required UTF-16 range observed',
      );
  }
  for (const failure of restorationFailures) addIssue('scroll-restoration-failed', failure);
  const findings = [
    ...new Map(
      states.flatMap((state) => state.report.findings).map((item) => [issueKey(item), item]),
    ).values(),
  ];
  const unmeasured = [
    ...new Map(
      [...states.flatMap((state) => state.report.unmeasured), ...extraIssues]
        .filter(
          (item) =>
            item.kind !== 'unobserved-scroll-state' ||
            !item.sourceKey ||
            !sources.get(item.sourceKey)?.complete,
        )
        .map((item) => [issueKey(item), item]),
    ).values(),
  ];
  const samples = new Map<string, PublicTypographySample>();
  for (const state of states) {
    for (const sample of state.report.samples) {
      if (!sample.rects.length && sources.get(sample.sourceKey)?.complete) continue;
      const merged = {
        ...sample,
        paintUnmeasured: sample.paintUnmeasured.filter(
          (reason) =>
            reason !== 'unobserved-scroll-state' || !sources.get(sample.sourceKey)?.complete,
        ),
      };
      const fingerprint = JSON.stringify({ ...merged, rects: [] });
      const existing = samples.get(fingerprint);
      if (!existing || (!existing.rects.length && merged.rects.length))
        samples.set(fingerprint, merged);
    }
  }
  return {
    ...initial,
    findings,
    unmeasured,
    samples: [...samples.values()],
    coverage: { ...initial.coverage, textSamples: samples.size, unsupported: unmeasured.length },
    scrollCoverage: [...sources.values()].map(({ complete: _complete, ...source }) => source),
    scrollProof: {
      maximumStates,
      plannedStates,
      planComplete,
      states,
      sources: [...sources.values()],
      initialWindow,
      restored,
      restorationFailures,
    },
  };
}
