/**
 * Tests for ./sessionLabeling.ts — the W5 stage-2 desktop consumer of
 * @agiworkforce/types's session-taxonomy and ExecutionProfile contracts.
 *
 * Covers: per-mode AppSession/ExecutionProfile label correctness, invariant
 * assertions firing on a deliberately inconsistent fixture, the
 * composition-root agreement check (both that it stays silent for the real
 * wiring and that it genuinely catches a wrong-class wiring bug — not a
 * trivial no-op), and that `createDesktopChatRuntimeWithLabeling` selects
 * identically to the unwrapped `createDesktopChatRuntime`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { getSessionKindDefaults, type ChatExecutionMode } from '@agiworkforce/types';
import { createDesktopChatRuntime } from '../desktopChatRuntime';
import { CloudRuntime } from '../CloudRuntime';
import { TauriRuntime } from '../TauriRuntime';
import { WebRuntime } from '../WebRuntime';
import {
  assertDesktopRuntimeAgreesWithExecutionProfile,
  createDesktopChatRuntimeWithLabeling,
  desktopExecutionProfileFor,
  labelDesktopSession,
} from '../sessionLabeling';

describe('labelDesktopSession', () => {
  it('labels local_only as desktop_local_chat with no invariant violations', () => {
    const session = labelDesktopSession({
      id: 'conv_1',
      ownerUserId: 'user_1',
      chatExecutionMode: 'local_only',
    });
    expect(session.kind).toBe('desktop_local_chat');
    expect(session.originSurface).toBe('desktop');
    expect(session.trustBoundary).toEqual({ privacyMode: 'local', providerMode: 'Local' });
    expect(session.syncPolicy.syncEligible).toBe(false);
    expect(session.storageScope).toBe('local_device');
  });

  it('labels byok as desktop_byok_chat with the direct-provider trust boundary', () => {
    const session = labelDesktopSession({
      id: 'conv_2',
      ownerUserId: 'user_1',
      chatExecutionMode: 'byok',
    });
    expect(session.kind).toBe('desktop_byok_chat');
    expect(session.trustBoundary).toEqual({ privacyMode: 'byok', providerMode: 'DirectByok' });
    expect(session.storageScope).toBe('direct_byok_provider');
    expect(session.syncPolicy.syncEligible).toBe(false);
  });

  it('labels cloud_managed as cloud_chat with sync eligibility', () => {
    const session = labelDesktopSession({
      id: 'conv_3',
      ownerUserId: 'user_1',
      chatExecutionMode: 'cloud_managed',
    });
    expect(session.kind).toBe('cloud_chat');
    expect(session.trustBoundary).toEqual({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
    expect(session.storageScope).toBe('synced_app_cloud');
    expect(session.syncPolicy.syncEligible).toBe(true);
  });

  it('carries an honestly-labeled placeholder capabilityDocument, not fabricated version data', () => {
    const session = labelDesktopSession({
      id: 'conv_4',
      ownerUserId: 'user_1',
      chatExecutionMode: 'local_only',
    });
    expect(session.policySnapshot.capabilityDocument.sessionId).toBe('conv_4');
    expect(session.policySnapshot.capabilityDocument.version).toBe(
      'unversioned-pending-capability-handshake',
    );
  });

  it('marks Local as a handoff source (real Fork-to-BYOK feature) and BYOK as its target', () => {
    const local = labelDesktopSession({
      id: 'conv_5',
      ownerUserId: 'user_1',
      chatExecutionMode: 'local_only',
    });
    const byok = labelDesktopSession({
      id: 'conv_6',
      ownerUserId: 'user_1',
      chatExecutionMode: 'byok',
    });
    expect(local.handoff).toEqual({ canBeHandoffSource: true, canBeHandoffTarget: false });
    expect(byok.handoff).toEqual({ canBeHandoffSource: false, canBeHandoffTarget: true });
  });
});

describe('labelDesktopSession tracks getSessionKindDefaults (no hand-inlined drift)', () => {
  // labelDesktopSession hand-writes each session's structural fields rather
  // than spreading getSessionKindDefaults(kind) — deliberately, because the
  // defaults return the general SessionKindDefaults shape while the per-kind
  // session interfaces narrow storageScope/trustBoundary/syncPolicy in ways
  // that don't spread cleanly. That means nothing at the type level stops
  // the two from drifting apart if someone edits the SSOT in taxonomy.ts.
  // These checks close that gap by asserting equality against the real
  // getSessionKindDefaults output for every kind this module emits.
  const cases: Array<{
    mode: ChatExecutionMode;
    kind: Parameters<typeof getSessionKindDefaults>[0];
  }> = [
    { mode: 'local_only', kind: 'desktop_local_chat' },
    { mode: 'byok', kind: 'desktop_byok_chat' },
    { mode: 'cloud_managed', kind: 'cloud_chat' },
  ];

  it.each(cases)('$kind matches getSessionKindDefaults($kind)', ({ mode, kind }) => {
    const session = labelDesktopSession({
      id: `drift_${kind}`,
      ownerUserId: 'user_1',
      chatExecutionMode: mode,
    });
    const defaults = getSessionKindDefaults(kind);
    expect(session.executionLocation).toBe(defaults.executionLocation);
    expect(session.executionAuthority).toBe(defaults.executionAuthority);
    expect(session.storageScope).toBe(defaults.storageScope);
    expect(session.syncPolicy.syncEligible).toBe(defaults.syncEligible);
    expect(session.hostRequirement).toEqual(defaults.hostRequirement);
    expect(session.trustBoundary).toEqual(defaults.trustBoundary);
  });
});

describe('desktopExecutionProfileFor', () => {
  const cases: Array<[ChatExecutionMode, 'local' | 'cloud', string]> = [
    ['local_only', 'local', 'Local'],
    ['byok', 'local', 'DirectByok'],
    ['cloud_managed', 'cloud', 'ManagedGateway'],
  ];

  for (const [mode, toggle, providerMode] of cases) {
    it(`resolves ${mode} to toggle "${toggle}" / providerMode "${providerMode}" with zero violations`, () => {
      const profile = desktopExecutionProfileFor(mode);
      expect(profile.toggle).toBe(toggle);
      expect(profile.inference.providerMode).toBe(providerMode);
    });
  }

  it('keeps tool/workflow planes local for BYOK — only the model call leaves the device', () => {
    const profile = desktopExecutionProfileFor('byok');
    expect(profile.tools.cloudExecutionAllowed).toBe(false);
    expect(profile.workflow.orchestrator).toBe('local_agent_loop');
  });
});

describe('assertDesktopRuntimeAgreesWithExecutionProfile', () => {
  it('does not throw when a local profile resolves to TauriRuntime', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('local_only'),
        new TauriRuntime(),
      ),
    ).not.toThrow();
  });

  it('does not throw when a cloud profile resolves to CloudRuntime', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('cloud_managed'),
        new CloudRuntime(),
      ),
    ).not.toThrow();
  });

  it('does not throw when a cloud profile resolves to WebRuntime (embedded build always cloud-like)', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('cloud_managed'),
        new WebRuntime(),
      ),
    ).not.toThrow();
  });

  it('THROWS when a local profile resolves to CloudRuntime (local must never reach cloud persistence)', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('local_only'),
        new CloudRuntime(),
      ),
    ).toThrow(/runtime-agreement violation/);
  });

  it('THROWS when a BYOK profile resolves to WebRuntime', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('byok'),
        new WebRuntime(),
      ),
    ).toThrow(/runtime-agreement violation/);
  });

  it('THROWS when a cloud profile resolves to TauriRuntime (no cloud persistence path there)', () => {
    expect(() =>
      assertDesktopRuntimeAgreesWithExecutionProfile(
        desktopExecutionProfileFor('cloud_managed'),
        new TauriRuntime(),
      ),
    ).toThrow(/runtime-agreement violation/);
  });
});

describe('createDesktopChatRuntimeWithLabeling — selection stays identical to createDesktopChatRuntime', () => {
  it('selects the same concrete class as the unwrapped composition root, for every environment', () => {
    const envs = [
      { isTauriHost: true, appMode: 'local' as const },
      { isTauriHost: true, appMode: 'cloud' as const },
      { isTauriHost: false, appMode: 'cloud' as const },
      { isTauriHost: true, appMode: 'corrupt' as 'local' },
    ];
    for (const env of envs) {
      const wrapped = createDesktopChatRuntimeWithLabeling(env);
      const unwrapped = createDesktopChatRuntime(env);
      expect(wrapped.constructor).toBe(unwrapped.constructor);
    }
  });

  it('does not throw for any real environment (the real wiring is self-consistent)', () => {
    expect(() =>
      createDesktopChatRuntimeWithLabeling({ isTauriHost: true, appMode: 'local' }),
    ).not.toThrow();
    expect(() =>
      createDesktopChatRuntimeWithLabeling({ isTauriHost: true, appMode: 'cloud' }),
    ).not.toThrow();
    expect(() =>
      createDesktopChatRuntimeWithLabeling({ isTauriHost: false, appMode: 'cloud' }),
    ).not.toThrow();
  });
});

describe('createDesktopChatRuntimeWithLabeling — the agreement check has real teeth, not a rubber stamp', () => {
  // Adversarial factories: `managed` is wired to the WRONG class (TauriRuntime
  // instead of CloudRuntime) — a realistic wiring bug. The plain-object stub
  // factories used by desktopChatRuntime.test.ts would sidestep `instanceof`
  // entirely, so this test deliberately uses real runtime classes.
  it('throws when the cloud factory is wired to a non-cloud runtime class', () => {
    const badFactories = {
      local: () => new TauriRuntime(),
      managed: () => new TauriRuntime(), // BUG: should be CloudRuntime
      web: () => new WebRuntime(),
    };
    expect(() =>
      createDesktopChatRuntimeWithLabeling({ isTauriHost: true, appMode: 'cloud' }, badFactories),
    ).toThrow(/runtime-agreement violation/);
  });

  it('throws when the local factory is wired to CloudRuntime', () => {
    const badFactories = {
      local: () => new CloudRuntime(), // BUG: should be TauriRuntime
      managed: () => new CloudRuntime(),
      web: () => new WebRuntime(),
    };
    expect(() =>
      createDesktopChatRuntimeWithLabeling({ isTauriHost: true, appMode: 'local' }, badFactories),
    ).toThrow(/runtime-agreement violation/);
  });

  it('does not throw for correctly-wired custom factories', () => {
    const goodFactories = {
      local: vi.fn(() => new TauriRuntime()),
      managed: vi.fn(() => new CloudRuntime()),
      web: vi.fn(() => new WebRuntime()),
    };
    const runtime = createDesktopChatRuntimeWithLabeling(
      { isTauriHost: true, appMode: 'cloud' },
      goodFactories,
    );
    expect(runtime).toBeInstanceOf(CloudRuntime);
    expect(goodFactories.managed).toHaveBeenCalledOnce();
  });
});

describe('createDesktopChatRuntimeWithLabeling — return type stays ChatRuntime (no wrapper leakage)', () => {
  it('the returned value is exactly the runtime instance, not a wrapped/decorated object', () => {
    const runtime: ChatRuntime = createDesktopChatRuntimeWithLabeling({
      isTauriHost: true,
      appMode: 'local',
    });
    expect(runtime).toBeInstanceOf(TauriRuntime);
    expect(typeof runtime.sendMessage).toBe('function');
  });
});
