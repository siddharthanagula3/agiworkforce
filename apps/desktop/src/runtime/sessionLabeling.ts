/**
 * Desktop session labeling — the stage-2 consumer wiring for
 * `@agiworkforce/types`'s session-taxonomy and ExecutionProfile contracts
 * (packages/contracts/types/src/sessions/). Purely additive: this module LABELS the
 * runtime's existing Local/BYOK/Cloud decisions with the shared contracts and
 * asserts they agree with what the runtime actually wires — it does not
 * change which runtime gets selected, what gets persisted, or any existing
 * control flow.
 *
 * Two integration points, matching the dispatch's "persistence/bootstrap
 * boundary" framing:
 *
 *   1. Composition-root agreement check (`createDesktopChatRuntimeWithLabeling`,
 *      wraps `createDesktopChatRuntime` without modifying it): coarse
 *      toggle-vs-concrete-class check. No per-session fields exist yet at
 *      this point, so this checks ONLY that the ExecutionProfile implied by
 *      the resolved (isTauriHost, appMode) pair agrees with which runtime
 *      class was actually returned — e.g. a `local` profile must never
 *      resolve to `CloudRuntime` (the only desktop runtime that calls the
 *      cloud persistence client).
 *   2. Per-conversation session labeling (`labelDesktopSession`, called from
 *      `TauriRuntime.ensureBackendConversation` and
 *      `CloudRuntime.createConversation`): builds the real `AppSession`
 *      record for the conversation being created and asserts its invariants.
 *
 * Both assertion paths are gated on `import.meta.env.DEV` (verified true
 * under this app's vitest run) so a violation fails loudly in dev/tests
 * without adding a new production failure mode — production session flow is
 * byte-for-byte unchanged. Enforcement of the trust boundary itself
 * continues to live where it already does (runtime selection in
 * `desktopChatRuntime.ts`, the egress chokepoint in cloud persistence); this
 * module only checks that the label agrees with that enforcement.
 *
 * KNOWN GAP (flag for review, not papered over): `policySnapshot`'s
 * `capabilityPolicyVersion` / `permissionPolicyVersion` are explicit,
 * clearly-named placeholders (`'unversioned-pending-capability-handshake'`),
 * not real version data — the W5 item-3 capability/permission handshake
 * (`packages/contracts/types/src/capability-handshake/`, sibling-owned) is not
 * consumed on desktop yet. Do not read these values as evidence a handshake
 * ran; replace them with the real handshake output once desktop consumes it.
 *
 * @module runtime/sessionLabeling
 */

import type { ChatExecutionMode } from '@agiworkforce/types';
import {
  assertExecutionProfile,
  assertSessionInvariants,
  resolveExecutionProfile,
  type AppSession,
  type CloudChatSession,
  type DesktopByokChatSession,
  type DesktopLocalChatSession,
  type ExecutionProfile,
  type ExecutionProfileToggle,
} from '@agiworkforce/types';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import {
  createDesktopChatRuntime,
  type DesktopChatRuntimeEnvironment,
  type DesktopChatRuntimeFactories,
} from './desktopChatRuntime';
import { CloudRuntime } from './CloudRuntime';
import { TauriRuntime } from './TauriRuntime';
import { WebRuntime } from './WebRuntime';

// ============================================================================
// Per-conversation session labeling
// ============================================================================

export interface DesktopSessionLabelInput {
  /** The conversation id this session represents (frontend uuid or backend numeric id, stringified). */
  id: string;
  ownerUserId: string;
  chatExecutionMode: ChatExecutionMode;
  createdAt?: string;
  updatedAt?: string;
}

const PENDING_CAPABILITY_HANDSHAKE_VERSION = 'unversioned-pending-capability-handshake';

/**
 * Builds and validates the `AppSession` record for a desktop conversation
 * from its real `ChatExecutionMode`. Throws (via `assertSessionInvariants`)
 * if the constructed session violates a cross-field invariant — call sites
 * gate this on `import.meta.env.DEV` so it never changes production flow.
 */
export function labelDesktopSession(input: DesktopSessionLabelInput): AppSession {
  const now = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? now;
  // capabilityDocument is a REF (CapabilityDocumentRef), not the full
  // EffectiveCapabilityDocument — desktop does not run the capability
  // handshake (packages/contracts/types/src/capability-handshake/, sibling-owned) yet,
  // so `version` is an explicit, clearly-named placeholder rather than a
  // fabricated version string. Replace with the real handshake ref once
  // desktop consumes it.
  const policySnapshot = {
    capabilityDocument: {
      sessionId: input.id,
      version: PENDING_CAPABILITY_HANDSHAKE_VERSION,
      computedAt: now,
    },
    permissionPolicyVersion: PENDING_CAPABILITY_HANDSHAKE_VERSION,
    snapshotAt: now,
  };

  if (input.chatExecutionMode === 'local_only') {
    const session: DesktopLocalChatSession = {
      id: input.id,
      kind: 'desktop_local_chat',
      ownerUserId: input.ownerUserId,
      executionLocation: 'device',
      executionAuthority: 'local_device',
      storageScope: 'local_device',
      syncPolicy: { syncEligible: false },
      trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      originSurface: 'desktop',
      accountScope: {},
      hostRequirement: { required: true, liveness: 'online' },
      policySnapshot,
      retentionPolicy: { deletionPolicy: 'user_deletable' },
      // Local -> BYOK fork is a real, live feature (Sidebar.tsx "Fork to BYOK");
      // Local is never itself a handoff *target*.
      handoff: { canBeHandoffSource: true, canBeHandoffTarget: false },
      createdAt: now,
      updatedAt,
    };
    assertSessionInvariants(session);
    return session;
  }

  if (input.chatExecutionMode === 'byok') {
    const session: DesktopByokChatSession = {
      id: input.id,
      kind: 'desktop_byok_chat',
      ownerUserId: input.ownerUserId,
      executionLocation: 'device',
      executionAuthority: 'byok_provider_account',
      storageScope: 'direct_byok_provider',
      syncPolicy: { syncEligible: false },
      trustBoundary: { privacyMode: 'byok', providerMode: 'DirectByok' },
      originSurface: 'desktop',
      accountScope: {},
      hostRequirement: { required: true, liveness: 'online' },
      policySnapshot,
      retentionPolicy: { deletionPolicy: 'user_deletable' },
      // BYOK conversations receive the Local->BYOK fork; not a further source yet.
      handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
      createdAt: now,
      updatedAt,
    };
    assertSessionInvariants(session);
    return session;
  }

  // 'cloud_managed'
  const session: CloudChatSession = {
    id: input.id,
    kind: 'cloud_chat',
    ownerUserId: input.ownerUserId,
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'synced_app_cloud',
    syncPolicy: { syncEligible: true, syncedSurfaces: ['web', 'desktop', 'mobile'] },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'desktop',
    accountScope: {},
    hostRequirement: { required: false },
    policySnapshot,
    retentionPolicy: { deletionPolicy: 'user_deletable' },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
    createdAt: now,
    updatedAt,
  };
  assertSessionInvariants(session);
  return session;
}

/**
 * Resolves and validates the `ExecutionProfile` for a desktop conversation's
 * `ChatExecutionMode`. `local_only`/`byok` both resolve under the `local`
 * toggle (BYOK is a sub-mode — see `packages/contracts/types/src/sessions/
 * execution-profile.ts` module doc); only `cloud_managed` resolves `cloud`.
 */
export function desktopExecutionProfileFor(mode: ChatExecutionMode): ExecutionProfile {
  const profile =
    mode === 'cloud_managed'
      ? resolveExecutionProfile({ toggle: 'cloud' })
      : resolveExecutionProfile({
          toggle: 'local',
          localInferenceMode: mode === 'byok' ? 'DirectByok' : 'Local',
        });
  assertExecutionProfile(profile);
  return profile;
}

// ============================================================================
// Composition-root agreement check
// ============================================================================

/**
 * Asserts that the concrete `ChatRuntime` instance actually returned by the
 * composition root agrees with the given `ExecutionProfile`'s toggle:
 *   - `local`  => must NOT be `CloudRuntime` (the only desktop runtime that
 *     calls `getDesktopCloudChatPersistenceClient()`).
 *   - `cloud`  => must be `CloudRuntime` or `WebRuntime` (both cloud/SSE
 *     runtimes; `WebRuntime` — the embedded non-Tauri build — always behaves
 *     cloud-like regardless of `appMode`, per its own module doc comment).
 *
 * Checks the actual returned object's class identity (`instanceof`), not a
 * second derivation from the same `(isTauriHost, appMode)` inputs used to
 * select it — so this catches a real wiring bug (e.g. a factory swapped to
 * construct the wrong runtime class), not just re-deriving the same branch.
 */
export function assertDesktopRuntimeAgreesWithExecutionProfile(
  profile: ExecutionProfile,
  runtime: ChatRuntime,
): void {
  const isCloudLikeRuntime = runtime instanceof CloudRuntime || runtime instanceof WebRuntime;
  const isTauriRuntime = runtime instanceof TauriRuntime;

  if (profile.toggle === 'local' && isCloudLikeRuntime) {
    throw new Error(
      'AGI desktop runtime-agreement violation: a local ExecutionProfile ' +
        `(providerMode "${profile.inference.providerMode}") resolved to a cloud-persistence ` +
        'runtime (CloudRuntime/WebRuntime). Local/BYOK conversations must never reach the ' +
        'cloud persistence client.',
    );
  }
  if (profile.toggle === 'cloud' && isTauriRuntime) {
    throw new Error(
      'AGI desktop runtime-agreement violation: a cloud ExecutionProfile resolved to ' +
        'TauriRuntime, which has no cloud persistence path. Managed-cloud conversations must ' +
        'be served by CloudRuntime or WebRuntime.',
    );
  }
}

/** The toggle implied by the composition root's own selection inputs — mirrors, does not alter, `createDesktopChatRuntime`'s branch order. */
function impliedToggleFor(environment: DesktopChatRuntimeEnvironment): ExecutionProfileToggle {
  if (!environment.isTauriHost) return 'cloud'; // WebRuntime — always cloud-like.
  return environment.appMode === 'cloud' ? 'cloud' : 'local';
}

/**
 * Additive wrapper around `createDesktopChatRuntime`: calls the real,
 * unmodified composition root, then — in dev/test only — resolves the
 * implied `ExecutionProfile` and asserts it agrees with the concrete runtime
 * class actually returned. Use this at the real app bootstrap call site
 * instead of `createDesktopChatRuntime` directly; the wrapped function's
 * selection behavior is byte-for-byte identical.
 */
export function createDesktopChatRuntimeWithLabeling(
  environment: DesktopChatRuntimeEnvironment,
  factories?: DesktopChatRuntimeFactories,
): ChatRuntime {
  const runtime = createDesktopChatRuntime(environment, factories);
  if (import.meta.env.DEV) {
    const profile = resolveExecutionProfile({ toggle: impliedToggleFor(environment) });
    assertExecutionProfile(profile);
    assertDesktopRuntimeAgreesWithExecutionProfile(profile, runtime);
  }
  return runtime;
}
