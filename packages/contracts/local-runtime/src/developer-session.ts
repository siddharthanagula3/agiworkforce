/**
 * The cross-surface half of the developer-session contract: the one permission
 * vocabulary and the one version rule that the CLI, VS Code, the desktop shell
 * and the Chrome bridge all answer to. Mirrors
 * `crates/agiworkforce-protocol/src/developer_session.rs`, which is the source
 * of truth; the test beside this file fails if the two drift.
 */

import type { DeveloperAgentMode, DeveloperReasoningEffort } from '@agiworkforce/types/protocol';

export type { DeveloperAgentMode, DeveloperReasoningEffort };

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
  'low',
  'medium',
  'high',
  'max',
] as const satisfies readonly DeveloperReasoningEffort[];

export const DEVELOPER_REASONING_EFFORT_LABELS: Record<DeveloperReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
};

export function developerAgentModeApprovesWithoutAsking(mode: DeveloperAgentMode): boolean {
  return mode === 'auto' || mode === 'bypass';
}

export function isDeveloperAgentModeReadOnly(mode: DeveloperAgentMode): boolean {
  return mode === 'plan';
}

export const DEVELOPER_SESSION_PROTOCOL_VERSION = 8;
export const SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS = [8, 7] as const;
export const LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION = 7;
export const MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION =
  SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS[
    SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.length - 1
  ]!;
export const PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE = -32005;
/** JSON-RPC code of a request refused because another program holds the thread's writer lease. */
export const THREAD_WRITER_CONFLICT_ERROR_CODE = -32011;
/**
 * JSON-RPC code of an `mcp/approval/grant` refused because the launch is no
 * longer the one the fingerprint names. Its `data` is the approval request
 * for the launch as it is now.
 */
export const MCP_APPROVAL_STALE_ERROR_CODE = -32012;

export type DeveloperSessionNegotiation =
  | { outcome: 'agreed'; protocolVersion: number }
  | { outcome: 'legacy'; protocolVersion: number }
  | {
      outcome: 'unsupported';
      requestedProtocolVersion: number;
      supportedProtocolVersions: number[];
      minimumProtocolVersion: number;
    };

/**
 * The one compatibility rule behind every surface pairing. A newer server keeps
 * answering an older client while its version stays supported: the added
 * methods are additive and an older client never calls them, which is how a new
 * backend feature degrades gracefully instead of dropping the session.
 */
export function negotiateDeveloperSessionProtocol(
  requested: number | null | undefined,
): DeveloperSessionNegotiation {
  if (requested === null || requested === undefined) {
    return { outcome: 'legacy', protocolVersion: LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION };
  }
  if ((SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS as readonly number[]).includes(requested)) {
    return { outcome: 'agreed', protocolVersion: requested };
  }
  return {
    outcome: 'unsupported',
    requestedProtocolVersion: requested,
    supportedProtocolVersions: [...SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS],
    minimumProtocolVersion: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
  };
}

/** Which side the user must upgrade when a handshake is refused. */
export function developerSessionUpgradeTarget(
  negotiation: DeveloperSessionNegotiation,
): 'client' | 'runtime' | null {
  if (negotiation.outcome !== 'unsupported') return null;
  return negotiation.requestedProtocolVersion < negotiation.minimumProtocolVersion
    ? 'client'
    : 'runtime';
}
