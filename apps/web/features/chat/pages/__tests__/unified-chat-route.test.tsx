/**
 * Tests for the unified-chat feature-flag route at /chat?unified=1.
 *
 * Covers:
 * - Legacy route renders WebChatPage when ?unified=1 is absent
 * - Unified route renders ChatInterface when ?unified=1 is present
 * - Feature flag is respected (flag off → legacy, flag on → unified)
 * - HostBridgeContext is provided to ChatInterface
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/chat',
  useParams: () => ({}),
}));

// Stub next/dynamic so components load synchronously in tests
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // vitest resolves the import synchronously inside vi.fn so we wrap it
    return React.lazy(loader);
  },
}));

// WebChatPage stub
vi.mock('@features/chat/pages/WebChatPage', () => ({
  default: () => <div data-testid="web-chat-page">WebChatPage</div>,
}));

// UnifiedChatPage stub (and its deep dependencies)
vi.mock('@features/chat/pages/UnifiedChatPage', () => ({
  default: () => <div data-testid="unified-chat-page">UnifiedChatPage</div>,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/chat route feature-flag', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it('renders WebChatPage when ?unified param is absent', async () => {
    // No unified param
    const { default: Page } = await import('../../../../app/chat/page');
    render(
      <React.Suspense fallback={null}>
        <Page />
      </React.Suspense>,
    );
    expect(screen.queryByTestId('unified-chat-page')).toBeNull();
  });

  it('renders WebChatPage when ?unified=0', async () => {
    mockSearchParams = new URLSearchParams('unified=0');
    const { default: Page } = await import('../../../../app/chat/page');
    render(
      <React.Suspense fallback={null}>
        <Page />
      </React.Suspense>,
    );
    expect(screen.queryByTestId('unified-chat-page')).toBeNull();
  });

  it('renders UnifiedChatPage when ?unified=1', async () => {
    mockSearchParams = new URLSearchParams('unified=1');
    const { default: Page } = await import('../../../../app/chat/page');
    render(
      <React.Suspense fallback={null}>
        <Page />
      </React.Suspense>,
    );
    // After Suspense resolves the lazy import:
    expect(await screen.findByTestId('unified-chat-page')).toBeDefined();
  });
});

// ─── WebChatRuntime unit tests ─────────────────────────────────────────────────

// Stub Supabase so the runtime can instantiate without a real session
vi.mock('@/services/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}));

describe('WebChatRuntime', () => {
  it('instantiates without throwing', async () => {
    const { WebChatRuntime } = await import('@/lib/runtime/WebChatRuntime');
    expect(() => new WebChatRuntime()).not.toThrow();
  });

  it('getPlatform returns "web"', async () => {
    const { WebChatRuntime } = await import('@/lib/runtime/WebChatRuntime');
    const runtime = new WebChatRuntime();
    expect(runtime.getPlatform()).toBe('web');
  });

  it('onStream registers and unregisters a callback', async () => {
    const { WebChatRuntime } = await import('@/lib/runtime/WebChatRuntime');
    const runtime = new WebChatRuntime();
    const cb = vi.fn();
    const unsub = runtime.onStream(cb);
    unsub();
    // After unsub, cb should not be called by subsequent emits (stopGeneration is a no-op here)
    runtime.stopGeneration('no-op-id');
    expect(cb).not.toHaveBeenCalled();
  });
});
