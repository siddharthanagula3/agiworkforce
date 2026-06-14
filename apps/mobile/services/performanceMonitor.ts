/**
 * performanceMonitor — captures tok/s, TTFT, memory, and thermal state per
 * inference event. All measurements are stored in MMKV under:
 *
 *   perf-events-v1  — JSON array of PerfEvent (capped at MAX_EVENTS)
 *   benchmark-history-v1  — JSON array of BenchmarkResult
 *
 * Design constraints:
 *   - No native module calls outside @agiworkforce/local-llm
 *   - Thermal state read from the last local capability snapshot
 *   - Memory estimated via a heuristic until a native module surfaces it
 */

import { storage } from '@/lib/mmkv';
import { isThermallyThrottled } from '@agiworkforce/local-llm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';
export type BackendName = 'foundation_models' | 'aicore' | 'executorch' | 'llama_rn';

export interface PerfEvent {
  /** Millisecond epoch timestamp for the inference */
  ts: number;
  /** Tokens per second (output phase) */
  tokensPerSecond: number;
  /** First-token latency in ms */
  firstTokenLatencyMs: number;
  /** Peak RSS memory in MB (0 if unavailable) */
  peakMemoryMB: number;
  /** Which runtime produced this event */
  backend: BackendName;
  /** Thermal state at start of inference */
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENTS_KEY = 'perf-events-v1';
const BENCHMARK_KEY = 'benchmark-history-v1';
const MAX_EVENTS = 500;
const MAX_BENCHMARKS = 50;
const ROLLING_WINDOW = 100;

// ---------------------------------------------------------------------------
// Thermal state detection
// ---------------------------------------------------------------------------

/**
 * Returns the current thermal state from the local capability snapshot.
 * The current native capability bridge exposes a boolean thermal-throttle
 * value, so avoid calling platform methods that are not exported.
 */
export function getThermalState(): ThermalState {
  return isThermallyThrottled() ? 'serious' : 'nominal';
}

// ---------------------------------------------------------------------------
// Event persistence
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a completed inference event. Caps the stored list at MAX_EVENTS
 * (oldest dropped first).
 */
export function recordPerfEvent(event: PerfEvent): void {
  const events = loadEvents();
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  saveEvents(events);
}

/**
 * Returns all recorded perf events, newest-first.
 */
export function getPerfEvents(): PerfEvent[] {
  return loadEvents().reverse();
}

/**
 * Returns events within the past N days (default 7).
 */
export function getPerfEventsLastDays(days = 7): PerfEvent[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadEvents()
    .filter((e) => e.ts >= cutoff)
    .reverse();
}

/**
 * Compute rolling stats over the last N events (default ROLLING_WINDOW = 100).
 */
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

/**
 * Persist a benchmark result. Caps at MAX_BENCHMARKS.
 */
export function recordBenchmark(result: BenchmarkResult): void {
  const all = loadBenchmarks();
  all.push(result);
  if (all.length > MAX_BENCHMARKS) {
    all.splice(0, all.length - MAX_BENCHMARKS);
  }
  saveBenchmarks(all);
}

/**
 * Returns all benchmark results, newest-first.
 */
export function getBenchmarkHistory(): BenchmarkResult[] {
  return loadBenchmarks().reverse();
}

/**
 * Clear all perf events and benchmark history (used in tests and wipe flows).
 */
export function clearPerfData(): void {
  storage.delete(EVENTS_KEY);
  storage.delete(BENCHMARK_KEY);
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

const BENCHMARK_PROMPT =
  'Summarize the key milestones of the space race between the US and USSR in three sentences.';

/**
 * Run a standardised benchmark against the currently loaded on-device model.
 *
 * The caller supplies a `generate` function that wraps the actual inference
 * call so this service remains agnostic to the tier/backend.
 *
 * Returns a BenchmarkResult which is also persisted via recordBenchmark().
 */
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
  // Approximate prompt token count: ~4 chars per token heuristic
  const promptTokens = Math.ceil(BENCHMARK_PROMPT.length / 4);
  const durationSec = Math.max((endTs - startTs) / 1000, 0.001);
  const firstTokenLatencyMs = firstTokenTs > 0 ? firstTokenTs - startTs : endTs - startTs;

  // Use result.tokenCount if the backend surfaces it; fall back to our counter
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
