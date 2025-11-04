import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB per invocation
const WINDOW_MS = 1000;
const MAX_REQS_PER_WINDOW = 30; // per-command, per-window

const buckets = new Map<string, number[]>();

function byteLength(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return 0;
  }
}

function rateLimit(key: string) {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_REQS_PER_WINDOW) {
    const retry = WINDOW_MS - (now - pruned[0]!);
    const err = new Error(`Rate limit exceeded for ${key}. Retry in ${retry}ms`);
    // Attach a hint for callers to surface user-friendly toasts
    (err as any).code = 'RATE_LIMIT';
    throw err;
  }
  pruned.push(now);
  buckets.set(key, pruned);
}

export async function invoke<T = unknown>(command: string, args?: Json): Promise<T> {
  // Enforce payload cap
  const size = byteLength(args);
  if (size > MAX_PAYLOAD_BYTES) {
    const err = new Error(`Payload too large: ${size} bytes (max ${MAX_PAYLOAD_BYTES})`);
    (err as any).code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }
  // Rate-limit by command name
  rateLimit(command);
  return tauriInvoke<T>(command as any, args as any);
}
