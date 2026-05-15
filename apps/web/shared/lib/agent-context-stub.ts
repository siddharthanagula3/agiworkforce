// Browser stub for @agiworkforce/runtime/context — AsyncLocalStorage is node-only.
// Client components that import @agiworkforce/runtime get no-op implementations
// for the agentContext APIs (they are Tauri/desktop-only features).

export function getAgentContext() {
  return undefined;
}

export function runWithContext<T>(_ctx: unknown, fn: () => T): T {
  return fn();
}

export function deriveChildContext(parent: unknown) {
  return parent;
}

export function reestablishContextInWorker(_ctx: unknown) {}

export type AgentContext = never;
export type AgentOrigin = never;
