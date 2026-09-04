/**
 * @agiworkforce/client-runtime/node
 *
 * Node/Tauri-only runtime exports. Use this subpath only from desktop (Tauri)
 * or other Node-resident processes. The mobile and web bundles MUST NOT
 * import from this entry, it transitively imports `node:async_hooks`.
 *
 * The universal `@agiworkforce/client-runtime` entry exposes everything that's
 * surface-agnostic (detect, command, events, errors, registry, http, queue, state).
 *
 * @packageDocumentation
 */

export {
  getAgentContext,
  runWithContext,
  deriveChildContext,
  reestablishContextInWorker,
} from './context';
export type { AgentContext, AgentOrigin } from './context';
