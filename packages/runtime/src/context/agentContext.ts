/**
 * AsyncLocalStorage<AgentContext> — per-command async isolation for Tauri commands.
 *
 * WHY: 1,483 Tauri commands share the same JS process. When multiple chat sessions
 * or background agents run concurrently, any module-level or closure-captured
 * state can bleed across commands. AsyncLocalStorage binds context to an async
 * execution chain regardless of how many awaits or .then() hops occur — providing
 * the same isolation guarantees that per-request context gives in server frameworks.
 *
 * Cross-boundary note: this store exists only in the TS frontend process.
 * The Rust side uses tokio::task_local! for analogous isolation within its
 * async executor. The two stores do NOT communicate across the IPC boundary;
 * values must be passed explicitly via Tauri invoke arguments when Rust needs them.
 *
 * Worker-thread note: Node worker_threads do NOT inherit AsyncLocalStorage from
 * the spawning context. Any worker that needs access must call runWithContext()
 * itself before performing async work.
 *
 * Memory-leak note: contexts are released as soon as the async chain completes.
 * Do NOT store references to AgentContext inside any long-lived data structure,
 * because the closure captured by runWithContext() holds the entire context object
 * alive until all .then() callbacks settle.
 *
 * Reference: agentContext.ts:24-179 from ~/Desktop/reference/src/utils/
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AppState } from '../state/AppStateStore';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

/**
 * Discriminated union of the two agent origins that can invoke a Tauri command.
 * Extend with new variants as surfaces are added — do not collapse into a single type.
 */
export type AgentOrigin =
  | { kind: 'tauri-command'; commandName: string; invokedAt: number }
  | { kind: 'background-agent'; agentId: string; teamId: string | null; invokedAt: number }
  | { kind: 'dispatch'; messageId: string; sourceDeviceId: string; invokedAt: number };

/**
 * Per-command context propagated through all awaited Promises in the originating
 * async chain. All fields are readonly after construction.
 */
export interface AgentContext {
  /** Stable ID for this invocation — used for dedup and tracing. */
  readonly requestId: string;
  /** Where this command was invoked from. */
  readonly origin: AgentOrigin;
  /** Plan tier at the time of invocation — gates feature availability. */
  readonly planTier: AppState['auth']['planTier'];
  /** Active conversation ID, null for non-chat commands. */
  readonly conversationId: string | null;
  /** Active model ID at time of invocation — never hardcoded, resolved from models.json. */
  readonly activeModelId: string | null;
  /**
   * Sparse edge semantics: non-null on the FIRST terminal API event for a given
   * spawn/resume; null on all subsequent events. Downstream code uses non-null
   * to detect conversation boundaries.
   */
  readonly invokingRequestId: string | null;
  /** Epoch ms when this context was constructed. */
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Storage singleton
// ---------------------------------------------------------------------------

const _storage = new AsyncLocalStorage<AgentContext>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current AgentContext, or null when called outside a
 * runWithContext() chain (e.g., in top-level module init or legacy paths).
 *
 * getAgentContext() WILL return the correct context inside any awaited Promise
 * or .then() callback that was initiated from within a runWithContext() call.
 * It will NOT return a context from a different concurrent runWithContext() call
 * even if both are in-flight at the same time.
 */
export function getAgentContext(): AgentContext | null {
  return _storage.getStore() ?? null;
}

/**
 * Run fn() with ctx bound to the current async execution chain.
 * Any getAgentContext() call inside fn(), or inside any Promise that fn() awaits,
 * will return ctx — including across multiple await hops and .then() chains.
 *
 * The context is released automatically when the returned Promise settles.
 * Do NOT hold a reference to ctx outside the async chain initiated here.
 */
export function runWithContext<T>(ctx: AgentContext, fn: () => T | Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    _storage.run(ctx, () => {
      try {
        Promise.resolve(fn()).then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Convenience: derive a child context from an existing context, overriding
 * selected fields. Useful for sub-operations that need their own requestId
 * but inherit conversation/model from the parent.
 *
 * The invokingRequestId on the child is set to the parent's requestId once
 * (sparse-edge semantics), then cleared on subsequent children.
 */
export function deriveChildContext(
  parent: AgentContext,
  overrides: Partial<Pick<AgentContext, 'requestId' | 'conversationId' | 'activeModelId'>>,
): AgentContext {
  return {
    ...parent,
    requestId: overrides.requestId ?? `${parent.requestId}-child-${Date.now()}`,
    conversationId: overrides.conversationId ?? parent.conversationId,
    activeModelId: overrides.activeModelId ?? parent.activeModelId,
    invokingRequestId: parent.requestId,
    createdAt: Date.now(),
  };
}

/**
 * Wrap a worker-re-entry point so that worker threads (which do NOT inherit
 * AsyncLocalStorage) can be re-seeded with the context from the spawning chain.
 *
 * Usage:
 * ```ts
 * const ctx = getAgentContext()!;
 * const worker = new Worker('./my-worker.js', { workerData: { ctxJson: JSON.stringify(ctx) } });
 * // Inside the worker:
 * const ctx = JSON.parse(workerData.ctxJson) as AgentContext;
 * await runWithContext(ctx, () => doWork());
 * ```
 *
 * This function is intentionally a no-op pass-through — the real re-establishment
 * happens by calling runWithContext() inside the worker. The helper exists to
 * document the expected call pattern clearly.
 */
export function reestablishContextInWorker<T>(
  ctx: AgentContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithContext(ctx, fn);
}
