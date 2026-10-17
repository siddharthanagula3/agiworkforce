import {
  approvedRootId,
  type DesktopCapability,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import { getPermissionState, getPermissionDecision } from './permissionManager';
import { getRoot } from './workspaceStore';

/**
 * The grant that lets the coding agent run in a folder. The CLI loads the
 * folder's hooks, commands and MCP servers as it starts, so starting it, and
 * anything that reaches a session through it, needs the same permission as
 * running a command there.
 */
export const AGENT_CAPABILITY: DesktopCapability = 'shell.execute';

/** A worktree is covered by the approved folder it was made from. */
export function agentScope(rootId: string): PermissionScope | null {
  const root = getRoot(approvedRootId(rootId));
  return root ? { kind: 'workspace', target: root.path } : null;
}

export function agentAllowedIn(rootId: string): boolean {
  const scope = agentScope(rootId);
  return scope !== null && getPermissionState(AGENT_CAPABILITY, scope) === 'granted';
}

/** The original decision time, never a fresh timestamp minted by a CLI restart. */
export function agentConsentAt(rootId: string): number | null {
  const scope = agentScope(rootId);
  if (!scope || !agentAllowedIn(rootId)) return null;
  const decision = getPermissionDecision(AGENT_CAPABILITY, scope);
  return decision && Number.isSafeInteger(decision.decidedAtMs) ? decision.decidedAtMs : null;
}
