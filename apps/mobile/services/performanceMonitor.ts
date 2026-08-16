
import { storage } from '@/lib/mmkv';
import { isThermallyThrottled } from '@agiworkforce/local-llm';

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';
export type BackendName = 'foundation_models' | 'aicore' | 'executorch' | 'llama_rn';

export interface PerfEvent {
  ts: number;
  tokensPerSecond: number;
  firstTokenLatencyMs: number;
  peakMemoryMB: number;
  backend: BackendName;
  thermalState: ThermalState;
}

export interface BenchmarkResult {
  ts: number;
  modelId: string;
  backend: BackendName;
  tokensPerSecond: number;
  firstTokenLatencyMs: number;
  peakMemoryMB: number;
  thermalState: ThermalState;
  promptTokens: number;
  outputTokens: number;
}

export interface RollingStats {
  avgToksPerSecond: number;
  avgFirstTokenLatencyMs: number;
  peakMemoryMB: number;
  sampleCount: number;
}

const EVENTS_KEY = 'perf-events-v1';
const BENCHMARK_KEY = 'benchmark-history-v1';
const MAX_EVENTS = 500;
const MAX_BENCHMARKS = 50;
const ROLLING_WINDOW = 100;

export function getThermalState(): ThermalState {
  return isThermallyThrottled() ? 'serious' : 'nominal';
}

function loadEvents(): PerfEvent[] {
  const raw = storage.getString(EVENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PerfEvent[];
  } catch {
    return [];
  }
}

function saveEvents(events: PerfEvent[]): void {
  storage.set(EVENTS_KEY, JSON.stringify(events));
}

function loadBenchmarks(): BenchmarkResult[] {
  const raw = storage.getString(BENCHMARK_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as BenchmarkResult[];
  } catch {
    return [];
  }
}

function saveBenchmarks(benchmarks: BenchmarkResult[]): void {
  storage.set(BENCHMARK_KEY, JSON.stringify(benchmarks));
}

export function recordPerfEvent(event: PerfEvent): void {
  const events = loadEvents();
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  saveEvents(events);
}

export function getPerfEvents(): PerfEvent[] {
  return loadEvents().reverse();
}

export function getPerfEventsLastDays(days = 7): PerfEvent[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadEvents()
    .filter((e) => e.ts >= cutoff)
    .reverse();
}

export function getRollingStats(window = ROLLING_WINDOW): RollingStats {
  const all = loadEvents();
  const slice = all.slice(-window);
  if (slice.length === 0) {
    return { avgToksPerSecond: 0, avgFirstTokenLatencyMs: 0, peakMemoryMB: 0, sampleCount: 0 };
  }
  const avgToksPerSecond = slice.reduce((s, e) => s + e.tokensPerSecond, 0) / slice.length;
  const avgFirstTokenLatencyMs =
    slice.reduce((s, e) => s + e.firstTokenLatencyMs, 0) / slice.length;
  const peakMemoryMB = slice.reduce((max, e) => Math.max(max, e.peakMemoryMB), 0);
  return { avgToksPerSecond, avgFirstTokenLatencyMs, peakMemoryMB, sampleCount: slice.length };
}

export function recordBenchmark(result: BenchmarkResult): void {
  const all = loadBenchmarks();
  all.push(result);
  if (all.length > MAX_BENCHMARKS) {
    all.splice(0, all.length - MAX_BENCHMARKS);
  }
  saveBenchmarks(all);
}

export function getBenchmarkHistory(): BenchmarkResult[] {
  return loadBenchmarks().reverse();
}

export function clearPerfData(): void {
  storage.delete(EVENTS_KEY);
  storage.delete(BENCHMARK_KEY);
}

const BENCHMARK_PROMPT =
  'Summarize the key milestones of the space race between the US and USSR in three sentences.';

export async function runBenchmark(opts: {
  modelId: string;
  backend: BackendName;
  generate: (opts: {
    prompt: string;
    onToken: (tok: string) => void;
  }) => Promise<{ text: string; tokenCount: number }>;
}): Promise<BenchmarkResult> {
  const thermalState = getThermalState();
  const startTs = Date.now();
  let firstTokenTs = 0;
  let outputTokens = 0;

  const result = await opts.generate({
    prompt: BENCHMARK_PROMPT,
    onToken: (_tok) => {
      if (firstTokenTs === 0) {
        firstTokenTs = Date.now();
      }
      outputTokens += 1;
    },
  });

  const endTs = Date.now();
  const promptTokens = Math.ceil(BENCHMARK_PROMPT.length / 4);
  const durationSec = Math.max((endTs - startTs) / 1000, 0.001);
  const firstTokenLatencyMs = firstTokenTs > 0 ? firstTokenTs - startTs : endTs - startTs;

  const totalOutputTokens = result.tokenCount > 0 ? result.tokenCount : outputTokens;
  const tokensPerSecond = totalOutputTokens / durationSec;

  const benchmarkResult: BenchmarkResult = {
    ts: startTs,
    modelId: opts.modelId,
    backend: opts.backend,
    tokensPerSecond,
    firstTokenLatencyMs,
    peakMemoryMB: 0, // native module exposes this post-hoc on supported tiers
    thermalState,
    promptTokens,
    outputTokens: totalOutputTokens,
  };

  recordBenchmark(benchmarkResult);
  return benchmarkResult;
}
