import { unified } from 'unified';
import remarkParse from 'remark-parse';

import { REMARK_PLUGINS } from '../remarkPlugins';
import { createMarkdownBlockSplitter } from '../splitMarkdownBlocks';
import { MARKDOWN_STREAM_CORPUS, streamChunks } from '../__fixtures__/markdownStreamCorpus';

const fullReparseProcessor = unified().use(remarkParse).use(REMARK_PLUGINS).freeze();

const DOCUMENT_SEPARATOR = '\n\n';
const SETTLEMENT_PROBE = ['', 'First probe paragraph.', '', 'Second probe paragraph.', ''].join(
  DOCUMENT_SEPARATOR,
);

const WARMUP_ITERATIONS = 1;
const SAMPLE_HEADROOM_FACTOR = 2;

export const MAX_TAIL_COST_GROWTH = 4;
export const MIN_FULL_REPARSE_GROWTH = 4;

export interface ParseCostProfile {
  readonly sizes: readonly number[];
  readonly referenceSize: number;
  readonly chunkCeiling: number;
  readonly samplesPerSize: number;
  readonly fullReparseSamplesPerSize: number;
  readonly iterations: number;
  readonly seed: number;
}

export const FAST_PARSE_COST_PROFILE: ParseCostProfile = {
  sizes: [1_000, 8_000],
  referenceSize: 1_000,
  chunkCeiling: 27,
  samplesPerSize: 24,
  fullReparseSamplesPerSize: 12,
  iterations: 2,
  seed: 20260901,
};

export const FULL_PARSE_COST_PROFILE: ParseCostProfile = {
  sizes: [1_000, 10_000, 50_000, 100_000],
  referenceSize: 10_000,
  chunkCeiling: 27,
  samplesPerSize: 64,
  fullReparseSamplesPerSize: 5,
  iterations: 5,
  seed: 20260901,
};

export interface ParseCostRow {
  readonly size: number;
  readonly tailMedianMs: number;
  readonly fullReparseMedianMs: number;
  readonly tailMedianChars: number;
  readonly samples: number;
  readonly fullReparseSamples: number;
}

export interface ParseCostReport {
  readonly rows: readonly ParseCostRow[];
  readonly referenceSize: number;
  readonly documentChars: number;
  readonly flushes: number;
}

export interface ParseCostGrowth {
  readonly tail: number;
  readonly fullReparse: number;
}

function settlesFully(source: string): boolean {
  const content = source + SETTLEMENT_PROBE;
  const split = createMarkdownBlockSplitter().update(content);
  return !split.hasReferenceDefinition && content.length - split.tail.length >= source.length;
}

const SETTLING_SOURCES: readonly string[] = MARKDOWN_STREAM_CORPUS.filter((document) =>
  settlesFully(document.source),
).map((document) => document.source);

function buildDocument(minimumChars: number): string {
  if (SETTLING_SOURCES.length === 0) {
    throw new Error('No corpus document settles; the parse-cost harness has nothing to measure.');
  }

  const parts: string[] = [];
  let length = 0;
  while (length < minimumChars) {
    const source = SETTLING_SOURCES[parts.length % SETTLING_SOURCES.length] ?? '';
    parts.push(source);
    length += source.length + DOCUMENT_SEPARATOR.length;
  }
  return parts.join(DOCUMENT_SEPARATOR);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? Number.NaN;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? Number.NaN) + upper) / 2;
}

function push(into: Map<number, number[]>, size: number, value: number): void {
  const existing = into.get(size);
  if (existing) existing.push(value);
  else into.set(size, [value]);
}

function planSampledFlushes(
  chunks: readonly string[],
  sizes: readonly number[],
  samplesPerSize: number,
): readonly (number | undefined)[] {
  const plan: (number | undefined)[] = new Array<number | undefined>(chunks.length).fill(undefined);
  const budget = new Map(sizes.map((size) => [size, samplesPerSize]));
  let accumulated = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    accumulated += (chunks[index] ?? '').length;
    for (const size of sizes) {
      const left = budget.get(size) ?? 0;
      if (left <= 0 || accumulated < size) continue;
      plan[index] = size;
      budget.set(size, left - 1);
      break;
    }
  }

  return plan;
}

// Slicing the finished document at each flush boundary rather than growing a
// string with += keeps the streaming buffer's own O(message) flatten out of the
// timed region. That cost is identical before and after the split, so leaving it
// in would swamp the parse cost this harness exists to compare.
function flushBoundaries(chunks: readonly string[]): readonly number[] {
  const boundaries: number[] = [];
  let accumulated = 0;
  for (const chunk of chunks) {
    accumulated += chunk.length;
    boundaries.push(accumulated);
  }
  return boundaries;
}

interface TailMeasurement {
  readonly durations: Map<number, number[]>;
  readonly tailChars: Map<number, number[]>;
}

function measureTailCost(
  document: string,
  boundaries: readonly number[],
  plan: readonly (number | undefined)[],
): TailMeasurement {
  const splitter = createMarkdownBlockSplitter();
  const durations = new Map<number, number[]>();
  const tailChars = new Map<number, number[]>();

  for (let index = 0; index < boundaries.length; index += 1) {
    const content = document.slice(0, boundaries[index]);
    const size = plan[index];
    if (size === undefined) {
      splitter.update(content);
      continue;
    }
    const started = performance.now();
    const split = splitter.update(content);
    push(durations, size, performance.now() - started);
    push(tailChars, size, split.tail.length);
  }

  return { durations, tailChars };
}

function measureFullReparseCost(
  document: string,
  boundaries: readonly number[],
  plan: readonly (number | undefined)[],
  samplesPerSize: number,
): Map<number, number[]> {
  const durations = new Map<number, number[]>();

  for (let index = 0; index < boundaries.length; index += 1) {
    const size = plan[index];
    if (size === undefined) continue;
    if ((durations.get(size) ?? []).length >= samplesPerSize) continue;
    const content = document.slice(0, boundaries[index]);
    const started = performance.now();
    fullReparseProcessor.parse(content);
    push(durations, size, performance.now() - started);
  }

  return durations;
}

function drain(from: Map<number, number[]>, into: Map<number, number[]>): void {
  for (const [size, values] of from) {
    for (const value of values) push(into, size, value);
  }
}

export function measureStreamingParseCost(profile: ParseCostProfile): ParseCostReport {
  const sizes = [...profile.sizes].sort((left, right) => left - right);
  const largest = sizes[sizes.length - 1] ?? 0;
  const document = buildDocument(
    largest + profile.samplesPerSize * profile.chunkCeiling * SAMPLE_HEADROOM_FACTOR,
  );

  const tailDurations = new Map<number, number[]>();
  const tailChars = new Map<number, number[]>();
  const fullReparseDurations = new Map<number, number[]>();
  let flushes = 0;

  for (let iteration = 0; iteration < WARMUP_ITERATIONS + profile.iterations; iteration += 1) {
    const chunks = streamChunks(document, {
      seed: profile.seed + iteration,
      ceiling: profile.chunkCeiling,
    });
    const boundaries = flushBoundaries(chunks);
    const plan = planSampledFlushes(chunks, sizes, profile.samplesPerSize);
    const tail = measureTailCost(document, boundaries, plan);
    const fullReparse = measureFullReparseCost(
      document,
      boundaries,
      plan,
      profile.fullReparseSamplesPerSize,
    );
    if (iteration < WARMUP_ITERATIONS) continue;

    flushes = chunks.length;
    drain(tail.durations, tailDurations);
    drain(tail.tailChars, tailChars);
    drain(fullReparse, fullReparseDurations);
  }

  const rows = sizes.map((size) => ({
    size,
    tailMedianMs: median(tailDurations.get(size) ?? []),
    fullReparseMedianMs: median(fullReparseDurations.get(size) ?? []),
    tailMedianChars: median(tailChars.get(size) ?? []),
    samples: (tailDurations.get(size) ?? []).length,
    fullReparseSamples: (fullReparseDurations.get(size) ?? []).length,
  }));

  return { rows, referenceSize: profile.referenceSize, documentChars: document.length, flushes };
}

export function parseCostGrowth(report: ParseCostReport): ParseCostGrowth {
  const reference = report.rows.find((row) => row.size === report.referenceSize);
  const largest = report.rows[report.rows.length - 1];
  if (!reference || !largest) {
    throw new Error('Parse-cost report is missing the reference or the largest size.');
  }
  return {
    tail: largest.tailMedianMs / reference.tailMedianMs,
    fullReparse: largest.fullReparseMedianMs / reference.fullReparseMedianMs,
  };
}

const MS_PRECISION = 4;
const RATIO_PRECISION = 2;
const TABLE_COLUMNS = [
  'accumulated chars',
  'full reparse ms',
  'tail split ms',
  'tail chars',
  'split samples',
  'reparse samples',
];

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function formatParseCostTable(report: ParseCostReport): string {
  const growth = parseCostGrowth(report);
  return [
    row(TABLE_COLUMNS),
    row(TABLE_COLUMNS.map(() => '---')),
    ...report.rows.map((entry) =>
      row([
        entry.size.toLocaleString('en-US'),
        entry.fullReparseMedianMs.toFixed(MS_PRECISION),
        entry.tailMedianMs.toFixed(MS_PRECISION),
        String(Math.round(entry.tailMedianChars)),
        String(entry.samples),
        String(entry.fullReparseSamples),
      ]),
    ),
    '',
    `document ${report.documentChars.toLocaleString('en-US')} chars, ${report.flushes.toLocaleString('en-US')} flushes per iteration`,
    `growth from ${report.referenceSize.toLocaleString('en-US')} chars to the largest size: tail split x${growth.tail.toFixed(RATIO_PRECISION)}, full reparse x${growth.fullReparse.toFixed(RATIO_PRECISION)}`,
  ].join('\n');
}
