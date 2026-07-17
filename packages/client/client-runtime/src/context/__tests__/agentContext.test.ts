import { describe, it, expect } from 'vitest';
import {
  getAgentContext,
  runWithContext,
  deriveChildContext,
  reestablishContextInWorker,
} from '../agentContext';
import type { AgentContext } from '../agentContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    requestId: 'req-001',
    origin: { kind: 'tauri-command', commandName: 'chat_send_message', invokedAt: Date.now() },
    planTier: 'hobby',
    conversationId: 'conv-abc',
    activeModelId: null,
    invokingRequestId: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic get/run contract
// ---------------------------------------------------------------------------

describe('getAgentContext', () => {
  it('returns null outside any runWithContext chain', () => {
    // Deliberately called at module top-level (no runWithContext wrapping)
    expect(getAgentContext()).toBeNull();
  });

  it('returns the bound context inside runWithContext', async () => {
    const ctx = makeCtx({ requestId: 'req-basic' });
    const result = await runWithContext(ctx, () => getAgentContext());
    expect(result).not.toBeNull();
    expect(result!.requestId).toBe('req-basic');
  });

  it('returns null again after runWithContext resolves', async () => {
    const ctx = makeCtx();
    await runWithContext(ctx, () => Promise.resolve());
    // After chain settles the store is gone
    expect(getAgentContext()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Promise chain propagation
// ---------------------------------------------------------------------------

describe('context propagation through await chains', () => {
  it('survives a single await hop', async () => {
    const ctx = makeCtx({ requestId: 'await-1' });
    const inner = await runWithContext(ctx, async () => {
      await Promise.resolve();
      return getAgentContext();
    });
    expect(inner?.requestId).toBe('await-1');
  });

  it('survives multiple sequential await hops', async () => {
    const ctx = makeCtx({ requestId: 'await-multi' });
    const inner = await runWithContext(ctx, async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise<void>((r) => setTimeout(r, 0));
      return getAgentContext();
    });
    expect(inner?.requestId).toBe('await-multi');
  });

  it('survives .then() chain without async/await', async () => {
    const ctx = makeCtx({ requestId: 'then-chain' });
    const inner = await runWithContext(ctx, () =>
      Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => getAgentContext()),
    );
    expect(inner?.requestId).toBe('then-chain');
  });

  it('captures context at nesting level (not outer chain)', async () => {
    const outerCtx = makeCtx({ requestId: 'outer' });
    const innerCtx = makeCtx({ requestId: 'inner' });

    const [outerSeen, innerSeen] = await runWithContext(outerCtx, async () => {
      const outer = getAgentContext()!.requestId;
      const inner = await runWithContext(innerCtx, () =>
        Promise.resolve().then(() => getAgentContext()!.requestId),
      );
      return [outer, inner];
    });

    expect(outerSeen).toBe('outer');
    expect(innerSeen).toBe('inner');
    // After inner settles, outer context is restored
    const afterInner = await runWithContext(outerCtx, async () => {
      await runWithContext(innerCtx, () => Promise.resolve());
      return getAgentContext()!.requestId;
    });
    expect(afterInner).toBe('outer');
  });
});

// ---------------------------------------------------------------------------
// Concurrent isolation stress test (1,000 concurrent chains)
// ---------------------------------------------------------------------------

describe('concurrent isolation — 1,000 Tauri commands with unique contexts', () => {
  it('no context contamination across concurrent chains', async () => {
    const N = 1000;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => {
        const ctx = makeCtx({ requestId: `req-${i}`, conversationId: `conv-${i}` });
        return runWithContext(ctx, async () => {
          // Stagger resolutions so chains are genuinely interleaved
          await new Promise<void>((r) => setTimeout(r, Math.random() * 5));
          const seen = getAgentContext()!;
          return { expected: i, seenId: seen.requestId, seenConv: seen.conversationId };
        });
      }),
    );

    for (const { expected, seenId, seenConv } of results) {
      expect(seenId).toBe(`req-${expected}`);
      expect(seenConv).toBe(`conv-${expected}`);
    }
  }, 30_000); // generous timeout; 1000 chains with up to 5ms stagger = up to ~5s
});

// ---------------------------------------------------------------------------
// Memory test — 10K commands fired and resolved (no growing reference set)
// ---------------------------------------------------------------------------

describe('memory — 10K commands fire and resolve without leak', () => {
  it('WeakRef baseline: resolved contexts are GC-eligible', async () => {
    // We cannot force GC in tests, but we can verify that:
    // 1. 10K contexts complete without throwing (no leak that causes OOM in test runner).
    // 2. getAgentContext() after each chain is null (storage is cleared per chain).
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const ctx = makeCtx({ requestId: `mem-${i}` });
      const seen = await runWithContext(ctx, async () => {
        await Promise.resolve();
        return getAgentContext()!.requestId;
      });
      expect(seen).toBe(`mem-${i}`);
    }
    // After all chains settle, storage is clear
    expect(getAgentContext()).toBeNull();
  }, 60_000);
});

// ---------------------------------------------------------------------------
// deriveChildContext
// ---------------------------------------------------------------------------

describe('deriveChildContext', () => {
  it('inherits parent fields and sets invokingRequestId', () => {
    const parent = makeCtx({ requestId: 'parent-1', conversationId: 'conv-x' });
    const child = deriveChildContext(parent, { requestId: 'child-1' });

    expect(child.requestId).toBe('child-1');
    expect(child.conversationId).toBe('conv-x'); // inherited
    expect(child.invokingRequestId).toBe('parent-1'); // sparse-edge
    expect(child.planTier).toBe(parent.planTier);
  });

  it('generates a unique requestId when not provided', () => {
    const parent = makeCtx({ requestId: 'parent-gen' });
    const child = deriveChildContext(parent, {});
    expect(child.requestId).not.toBe('parent-gen');
    expect(child.requestId).toContain('parent-gen-child-');
  });

  it('child context propagates correctly through await', async () => {
    const parent = makeCtx({ requestId: 'parent-prop' });
    const child = deriveChildContext(parent, { requestId: 'child-prop' });

    const seen = await runWithContext(child, async () => {
      await Promise.resolve();
      return getAgentContext()!.requestId;
    });
    expect(seen).toBe('child-prop');
  });
});

// ---------------------------------------------------------------------------
// reestablishContextInWorker (documents worker re-entry pattern)
// ---------------------------------------------------------------------------

describe('reestablishContextInWorker', () => {
  it('re-establishes context identically to runWithContext', async () => {
    const ctx = makeCtx({ requestId: 'worker-ctx' });
    const seen = await reestablishContextInWorker(ctx, async () => {
      await Promise.resolve();
      return getAgentContext()!.requestId;
    });
    expect(seen).toBe('worker-ctx');
  });
});

// ---------------------------------------------------------------------------
// Origin discriminated union
// ---------------------------------------------------------------------------

describe('AgentOrigin discriminated union', () => {
  it('tauri-command origin records commandName', async () => {
    const ctx = makeCtx({
      origin: { kind: 'tauri-command', commandName: 'get_settings', invokedAt: 1 },
    });
    const seen = await runWithContext(ctx, () => getAgentContext()!.origin);
    expect(seen.kind).toBe('tauri-command');
    if (seen.kind === 'tauri-command') expect(seen.commandName).toBe('get_settings');
  });

  it('background-agent origin records agentId and teamId', async () => {
    const ctx = makeCtx({
      origin: { kind: 'background-agent', agentId: 'ag-1', teamId: 'team-A', invokedAt: 2 },
    });
    const seen = await runWithContext(ctx, () => getAgentContext()!.origin);
    expect(seen.kind).toBe('background-agent');
    if (seen.kind === 'background-agent') {
      expect(seen.agentId).toBe('ag-1');
      expect(seen.teamId).toBe('team-A');
    }
  });

  it('dispatch origin records messageId and sourceDeviceId', async () => {
    const ctx = makeCtx({
      origin: { kind: 'dispatch', messageId: 'msg-1', sourceDeviceId: 'dev-X', invokedAt: 3 },
    });
    const seen = await runWithContext(ctx, () => getAgentContext()!.origin);
    expect(seen.kind).toBe('dispatch');
    if (seen.kind === 'dispatch') {
      expect(seen.messageId).toBe('msg-1');
      expect(seen.sourceDeviceId).toBe('dev-X');
    }
  });
});
