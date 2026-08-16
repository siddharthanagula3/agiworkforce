
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
