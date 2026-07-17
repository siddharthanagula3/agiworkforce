/**
 * Agent collaboration types.
 *
 * The multi-agent CollaborationProtocol runtime that lived here was dead code
 * and was deleted; this module now only carries the type surface consumed by
 * the wired intelligent-agent-router.
 */

import type { ProtocolAgentCapability } from '@shared/types';

/**
 * Re-export canonical type for backward compatibility
 * @deprecated Import ProtocolAgentCapability from @shared/types instead
 */
export type AgentCapability = ProtocolAgentCapability;
