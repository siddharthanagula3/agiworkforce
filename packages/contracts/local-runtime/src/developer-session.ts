/**
 * The cross-surface half of the developer-session contract: the one permission
 * vocabulary and the one version rule that the CLI, VS Code, the desktop shell
 * and the Chrome bridge all answer to. Mirrors
 * `crates/agiworkforce-protocol/src/developer_session.rs`, which is the source
 * of truth; the test beside this file fails if the two drift.
 */

import {
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  getModelMetadataById,
} from '@agiworkforce/types';
import type {
  DeveloperAgentMode,
  DeveloperChildTaskState,
  DeveloperReasoningEffort,
} from '@agiworkforce/types/protocol';

export type { DeveloperAgentMode, DeveloperChildTaskState, DeveloperReasoningEffort };

/** Every posture on the wire, weakest first. */
export const DEVELOPER_AGENT_MODES = [
  'plan',
  'ask',
  'auto',
  'bypass',
] as const satisfies readonly DeveloperAgentMode[];

/**
 * The posture of a turn whose sender named none. The CLI keeps its posture
 * from one turn to the next, so a shell names one on every turn rather than
 * let a turn inherit whatever the last one ran in.
 */
export const DEVELOPER_UNNAMED_TURN_AGENT_MODE: DeveloperAgentMode = 'ask';

/**
 * The posture a turn started away from this computer may name, or null to
 * leave the thread in the mode it was last saved in. Bypass is confirmed here,
 * by the person at this screen, and a turn a paired phone starts never names
 * it whatever that turn asks for.
 */
export function remoteTurnAgentMode(
  requested: DeveloperAgentMode | null | undefined,
): DeveloperAgentMode | null {
  return requested && requested !== 'bypass' ? requested : null;
}

export const DEVELOPER_AGENT_MODE_LABELS: Record<DeveloperAgentMode, string> = {
  plan: 'Plan',
  ask: 'Ask',
  auto: 'Auto',
  bypass: 'Bypass permissions',
};

/**
 * Read a posture out of any surface's own spelling. Separators and case are
 * ignored. An unknown word returns null rather than a default, so a vocabulary
 * this build does not know can never widen a posture by accident.
 */
export function normalizeDeveloperAgentMode(
  raw: string | null | undefined,
): DeveloperAgentMode | null {
  switch ((raw ?? '').trim().toLowerCase().replace(/[-_ ]/g, '')) {
    // `default` is the CLI's name for the posture that prompts and `dontask`
    // is its headless refusal to prompt: neither may approve anything itself.
    case 'ask':
    case 'default':
    case 'dontask':
      return 'ask';
    case 'auto':
    case 'acceptedits':
      return 'auto';
    case 'plan':
      return 'plan';
    case 'bypass':
    case 'bypasspermissions':
      return 'bypass';
    default:
      return null;
  }
}

/** Every reasoning level on the wire, least first. */
export const DEVELOPER_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly DeveloperReasoningEffort[];

export const DEVELOPER_REASONING_EFFORT_LABELS: Record<DeveloperReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
};

/**
 * The levels a model's catalog row says it takes, in ladder order. Null when
 * the catalog does not know the model or names no list, so every level is
 * offered and the runtime maps it to the nearest one the model takes; empty
 * when the model takes no reasoning effort.
 */
export function developerEffortLevels(
  modelId: string | null | undefined,
): DeveloperReasoningEffort[] | null {
  if (!modelId) return null;
  const reasoning = getModelMetadataById(modelId)?.reasoning;
  if (reasoning === undefined) return null;
  if (!reasoning.capable) return [];
  const supported = reasoning.supportedEfforts;
  if (supported === undefined) return null;
  return DEVELOPER_REASONING_EFFORTS.filter((effort) => supported.includes(effort));
}

export const DEVELOPER_CHILD_TASK_STATE_LABELS: Record<DeveloperChildTaskState, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_input: 'Waiting for input',
  paused: 'Interrupted',
  completed: 'Done',
  cancelled: 'Stopped',
  failed: 'Failed',
};

export { DEVELOPER_SESSION_PROTOCOL_VERSION, PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE };
export const LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION = 7;
export const SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS = [
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
] as const;
/** JSON-RPC code of a request refused because another program holds the thread's writer lease. */
export const THREAD_WRITER_CONFLICT_ERROR_CODE = -32011;
/**
 * JSON-RPC code of an `mcp/approval/grant` refused because the launch is no
 * longer the one the fingerprint names. Its `data` is the approval request
 * for the launch as it is now.
 */
export const MCP_APPROVAL_STALE_ERROR_CODE = -32012;
