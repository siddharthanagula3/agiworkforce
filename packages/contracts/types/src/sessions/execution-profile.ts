/**
 * ExecutionProfile — the single visible Local/Cloud toggle that deterministically
 * resolves five internal execution planes (identity, data, inference, tools,
 * workflow), per the R5 adjudication recorded in
 * `docs/plans/target-structure-finalization-2026-07-15.md` §4.5 and
 * `docs/plans/restructure-execution-program-2026-07-15.md` W5 item 2:
 *
 * > ExecutionProfile — one visible Local/Cloud toggle resolving five internal
 * > planes (identity, data, inference, tools, workflow) — ADOPT as a contract
 * > in packages/contracts/types/src/sessions/ during discipline wave 1. Desktop's
 * > runtime composition root and Mobile's appMode-plus-egress-guard stack are
 * > the existing implementations; the contract names what they already do and
 * > extends it to every surface.
 *
 * The toggle is 2-way (`'local' | 'cloud'`), not 3-way: BYOK is a sub-mode of
 * the local position, not a third top-level value —
 * `apps/desktop/src/runtime/desktopChatRuntime.ts` already encodes this
 * ("Local-only and BYOK conversations both live here"; only `appMode ===
 * 'cloud'` selects the managed runtime). `resolveExecutionProfile` is the
 * deterministic resolver a host calls with the visible toggle plus the one
 * sub-choice that is NOT determined by the toggle alone (which local
 * inference path, which cloud routing path); every other field is fully
 * determined by the toggle, matching "resolving" in the phrase above.
 *
 * Composes with, does not fork, the trust kernel in `../suite-contracts`:
 * `ProviderMode` and `StorageScope` are reused directly, and the cloud sync
 * default reuses `SYNCED_APP_SURFACES` rather than a parallel list.
 *
 * Scope note: only the identity/tools/workflow planes needed new types here.
 * The data and inference planes are expressed directly in kernel terms
 * (`StorageScope`, `SessionSyncPolicy`, `ProviderMode`) rather than being
 * reinvented.
 *
 * @module sessions/execution-profile
 */

import type { ProviderMode, StorageScope } from '../suite-contracts';
import { SYNCED_APP_SURFACES } from '../suite-contracts';
import { getSessionKindDefaults, type SessionKind, type SessionSyncPolicy } from './taxonomy';

export type ExecutionProfileToggle = 'local' | 'cloud';

export const EXECUTION_PROFILE_TOGGLES = [
  'local',
  'cloud',
] as const satisfies readonly ExecutionProfileToggle[];

export type ExecutionIdentitySource =
  | 'device_keychain'
  | 'byok_credential_store'
  | 'agi_managed_account';

export interface ExecutionIdentityPlane {
  source: ExecutionIdentitySource;
  accountUserId?: string | null;
}

export interface ExecutionDataPlane {
  storageScope: StorageScope;
  syncPolicy: SessionSyncPolicy;
}

export interface ExecutionInferencePlane {
  providerMode: ProviderMode;
}

export type ExecutionToolsSurface = 'local_process' | 'managed_sandbox';

export interface ExecutionToolsPlane {
  executionSurface: ExecutionToolsSurface;
  cloudExecutionAllowed: boolean;
}

export type ExecutionOrchestrator = 'local_agent_loop' | 'managed_workflow_engine';

export interface ExecutionWorkflowPlane {
  orchestrator: ExecutionOrchestrator;
}

export interface ExecutionProfile {
  toggle: ExecutionProfileToggle;
  identity: ExecutionIdentityPlane;
  data: ExecutionDataPlane;
  inference: ExecutionInferencePlane;
  tools: ExecutionToolsPlane;
  workflow: ExecutionWorkflowPlane;
}

export interface ExecutionProfileInput {
  toggle: ExecutionProfileToggle;
  localInferenceMode?: Extract<ProviderMode, 'Local' | 'DirectByok'>;
  cloudInferenceMode?: Extract<ProviderMode, 'ManagedGateway' | 'ManagedNative'>;
  accountUserId?: string | null | undefined;
}

export function resolveExecutionProfile(input: ExecutionProfileInput): ExecutionProfile {
  if (input.toggle === 'local') {
    const providerMode = input.localInferenceMode ?? 'Local';
    const isByok = providerMode === 'DirectByok';
    return {
      toggle: 'local',
      identity: {
        source: isByok ? 'byok_credential_store' : 'device_keychain',
        accountUserId: input.accountUserId ?? null,
      },
      data: {
        storageScope: isByok ? 'direct_byok_provider' : 'local_device',
        syncPolicy: { syncEligible: false },
      },
      inference: { providerMode },
      tools: { executionSurface: 'local_process', cloudExecutionAllowed: false },
      workflow: { orchestrator: 'local_agent_loop' },
    };
  }

  const providerMode = input.cloudInferenceMode ?? 'ManagedGateway';
  return {
    toggle: 'cloud',
    identity: { source: 'agi_managed_account', accountUserId: input.accountUserId ?? null },
    data: {
      storageScope: 'synced_app_cloud',
      syncPolicy: { syncEligible: true, syncedSurfaces: SYNCED_APP_SURFACES },
    },
    inference: { providerMode },
    tools: { executionSurface: 'managed_sandbox', cloudExecutionAllowed: true },
    workflow: { orchestrator: 'managed_workflow_engine' },
  };
}

const LOCAL_PROVIDER_MODES: ReadonlySet<ProviderMode> = new Set<ProviderMode>([
  'Local',
  'DirectByok',
]);
const CLOUD_PROVIDER_MODES: ReadonlySet<ProviderMode> = new Set<ProviderMode>([
  'ManagedGateway',
  'ManagedNative',
]);

export type ExecutionProfileViolationCode =
  | 'inference-provider-mode-mismatch'
  | 'identity-source-mismatch'
  | 'data-plane-egress-violation'
  | 'tools-plane-egress-violation'
  | 'workflow-plane-mismatch';

export interface ExecutionProfileViolation {
  code: ExecutionProfileViolationCode;
  message: string;
}

export function validateExecutionProfile(profile: ExecutionProfile): ExecutionProfileViolation[] {
  const violations: ExecutionProfileViolation[] = [];
  const add = (code: ExecutionProfileViolationCode, message: string) =>
    violations.push({ code, message });

  if (profile.toggle === 'local') {
    if (!LOCAL_PROVIDER_MODES.has(profile.inference.providerMode)) {
      add(
        'inference-provider-mode-mismatch',
        `Local execution profile must use Local or DirectByok inference, got "${profile.inference.providerMode}".`,
      );
    }
    if (profile.identity.source === 'agi_managed_account') {
      add(
        'identity-source-mismatch',
        'Local execution profile must not anchor identity on the managed-account plane.',
      );
    }
    if (profile.data.syncPolicy.syncEligible) {
      add(
        'data-plane-egress-violation',
        'Local execution profile must not claim sync eligibility (no automatic cloud egress).',
      );
    }
    if (
      profile.tools.cloudExecutionAllowed ||
      profile.tools.executionSurface === 'managed_sandbox'
    ) {
      add(
        'tools-plane-egress-violation',
        'Local execution profile must not allow managed/cloud tool execution.',
      );
    }
    if (profile.workflow.orchestrator !== 'local_agent_loop') {
      add(
        'workflow-plane-mismatch',
        'Local execution profile must run the local agent loop, not the managed workflow engine.',
      );
    }
  } else {
    if (!CLOUD_PROVIDER_MODES.has(profile.inference.providerMode)) {
      add(
        'inference-provider-mode-mismatch',
        `Cloud execution profile must use ManagedGateway or ManagedNative inference, got "${profile.inference.providerMode}".`,
      );
    }
    if (profile.identity.source !== 'agi_managed_account') {
      add(
        'identity-source-mismatch',
        'Cloud execution profile must anchor identity on the managed-account plane.',
      );
    }
    if (profile.workflow.orchestrator !== 'managed_workflow_engine') {
      add(
        'workflow-plane-mismatch',
        'Cloud execution profile must run the managed workflow engine.',
      );
    }
  }

  return violations;
}

export function assertExecutionProfile(profile: ExecutionProfile): void {
  const violations = validateExecutionProfile(profile);
  if (violations.length === 0) return;
  const codes = violations.map((v) => v.code).join(', ');
  const messages = violations.map((v) => `- ${v.code}: ${v.message}`).join('\n');
  throw new Error(`AGI execution-profile invariant violation [${codes}]:\n${messages}`);
}

export type ExecutionProfileGovernedSessionKind = Extract<
  SessionKind,
  'cloud_chat' | 'desktop_local_chat' | 'desktop_byok_chat' | 'mobile_local_chat'
>;

export const EXECUTION_PROFILE_GOVERNED_SESSION_KINDS = [
  'cloud_chat',
  'desktop_local_chat',
  'desktop_byok_chat',
  'mobile_local_chat',
] as const satisfies readonly ExecutionProfileGovernedSessionKind[];

export function executionProfileForSessionKind(
  kind: ExecutionProfileGovernedSessionKind,
  input?: { accountUserId?: string | null },
): ExecutionProfile {
  const providerMode = getSessionKindDefaults(kind).trustBoundary.providerMode;

  if (providerMode === 'Local' || providerMode === 'DirectByok') {
    return resolveExecutionProfile({
      toggle: 'local',
      localInferenceMode: providerMode,
      accountUserId: input?.accountUserId,
    });
  }

  return resolveExecutionProfile({
    toggle: 'cloud',
    cloudInferenceMode: providerMode,
    accountUserId: input?.accountUserId,
  });
}
