
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AppState } from '../state/AppStateStore';

export type AgentOrigin =
  | { kind: 'tauri-command'; commandName: string; invokedAt: number }
  | { kind: 'background-agent'; agentId: string; teamId: string | null; invokedAt: number }
  | { kind: 'dispatch'; messageId: string; sourceDeviceId: string; invokedAt: number };

export interface AgentContext {
  readonly requestId: string;
  readonly origin: AgentOrigin;
  readonly planTier: AppState['auth']['planTier'];
  readonly conversationId: string | null;
  readonly activeModelId: string | null;
  readonly invokingRequestId: string | null;
  readonly createdAt: number;
}

const _storage = new AsyncLocalStorage<AgentContext>();

export function getAgentContext(): AgentContext | null {
  return _storage.getStore() ?? null;
}

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

export function reestablishContextInWorker<T>(
  ctx: AgentContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithContext(ctx, fn);
}
