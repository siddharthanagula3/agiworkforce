import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatExecutionMode, ManagedUsageSummaryResponse } from '@agiworkforce/types';

import { useChatStore } from '../../stores/chatStore';
import { HostBridgeContext, type ChatHostBridge } from '../../lib/hostBridge';
import type { ChatMessage, Conversation } from '../../lib/types';
import {
  ContextUsageMeter,
  contextUsagePercent,
  latestTurnContextUsage,
  planUsageState,
} from '../ContextUsageMeter';

function assistant(usage?: Record<string, unknown>): ChatMessage {
  return {
    id: `a-${Math.random()}`,
    role: 'assistant',
    content: 'reply',
    ...(usage ? { metadata: { usage } } : {}),
  } as ChatMessage;
}

function describedText(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function setMessages(messages: ChatMessage[]) {
  act(() => {
    useChatStore.setState({ messagesByConversation: { c1: messages } });
  });
}

describe('latestTurnContextUsage', () => {
  it('reads the last assistant turn that reported usage', () => {
    expect(latestTurnContextUsage(undefined)).toBeUndefined();
    expect(latestTurnContextUsage([assistant()])).toBeUndefined();
    expect(
      latestTurnContextUsage([
        assistant({ inputTokens: 10, contextWindow: 100 }),
        assistant({ inputTokens: 40, contextWindow: 100 }),
        assistant(),
      ]),
    ).toEqual({ tokensUsed: 40, contextWindow: 100 });
    expect(latestTurnContextUsage([assistant({ inputTokens: 40 })])).toBeNull();
  });
});

describe('ContextUsageMeter', () => {
  beforeEach(() => {
    useChatStore.setState({ messagesByConversation: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it("follows the latest turn's input tokens against its context window", async () => {
    const fetchInitialUsage = vi.fn(async () => ({ tokensUsed: 1, contextWindow: 100 }));
    setMessages([assistant({ inputTokens: 50_000, contextWindow: 200_000 })]);

    render(<ContextUsageMeter conversationId="c1" fetchInitialUsage={fetchInitialUsage} />);

    const meter = await screen.findByRole('meter', { name: 'Context used' });
    expect(meter.getAttribute('aria-valuenow')).toBe('25');
    expect(fetchInitialUsage).not.toHaveBeenCalled();

    setMessages([
      assistant({ inputTokens: 50_000, contextWindow: 200_000 }),
      assistant({ inputTokens: 100_000, contextWindow: 200_000 }),
    ]);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('50');
  });

  it('uses the host value only until the first turn reports usage', async () => {
    const fetchInitialUsage = vi.fn(async () => ({ tokensUsed: 20_000, contextWindow: 200_000 }));
    render(<ContextUsageMeter conversationId="c1" fetchInitialUsage={fetchInitialUsage} />);

    expect((await screen.findByRole('meter')).getAttribute('aria-valuenow')).toBe('10');
    expect(fetchInitialUsage).toHaveBeenCalledWith('c1');

    setMessages([assistant({ inputTokens: 60_000, contextWindow: 200_000 })]);
    await waitFor(() => expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('30'));
  });

  it('hides when the latest turn has no context window', () => {
    setMessages([assistant({ inputTokens: 60_000 })]);
    const { container } = render(<ContextUsageMeter conversationId="c1" />);
    expect(container.childElementCount).toBe(0);
  });

  it('caps at 100 percent', () => {
    expect(contextUsagePercent({ tokensUsed: 300_000, contextWindow: 200_000 })).toBe(100);
  });
});

function conversation(executionMode: ChatExecutionMode): Conversation {
  return {
    id: 'c1',
    title: 'Chat',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    pinned: false,
    archived: false,
    executionMode,
  };
}

function summary(
  overrides: Partial<ManagedUsageSummaryResponse> = {},
): ManagedUsageSummaryResponse {
  return {
    plan_tier: 'pro',
    usage_percentage: 42,
    usage_reset_at: null,
    has_usage_remaining: true,
    period_start: null,
    period_end: null,
    subscription_status: 'active',
    session_usage_percentage: 10,
    session_reset_at: null,
    weekly_usage_percentage: 42,
    weekly_reset_at: null,
    flagship_weekly_usage_percentage: 0,
    flagship_weekly_reset_at: null,
    ...overrides,
  };
}

function renderWithBridge(fetchPlanUsage: ChatHostBridge['fetchPlanUsage']) {
  const bridge: ChatHostBridge = {
    getSnapshot: () => ({ activeConversationId: 'c1', conversations: [] }),
    fetchPlanUsage,
  };
  return render(
    <HostBridgeContext.Provider value={bridge}>
      <ContextUsageMeter conversationId="c1" />
    </HostBridgeContext.Provider>,
  );
}

describe('ContextUsageMeter plan usage', () => {
  beforeEach(() => {
    useChatStore.setState({ messagesByConversation: {}, conversations: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('adds plan usage for a cloud managed conversation', async () => {
    const fetchPlanUsage = vi.fn(async () => summary());
    act(() => {
      useChatStore.setState({ conversations: [conversation('cloud_managed')] });
    });
    setMessages([assistant({ inputTokens: 50_000, contextWindow: 200_000 })]);

    renderWithBridge(fetchPlanUsage);

    expect(await screen.findByText('Plan usage: 42% used')).not.toBeNull();
    expect(describedText(screen.getByRole('meter'))).toBe('Plan usage: 42% used');
    expect(fetchPlanUsage).toHaveBeenCalledTimes(1);
  });

  it('refetches after each settled turn', async () => {
    const fetchPlanUsage = vi
      .fn<() => Promise<ManagedUsageSummaryResponse>>()
      .mockResolvedValueOnce(summary({ usage_percentage: 10 }))
      .mockResolvedValueOnce(summary({ usage_percentage: 15 }));
    act(() => {
      useChatStore.setState({ conversations: [conversation('cloud_managed')] });
    });
    setMessages([assistant({ inputTokens: 50_000, contextWindow: 200_000 })]);
    renderWithBridge(fetchPlanUsage);
    expect(await screen.findByText('Plan usage: 10% used')).not.toBeNull();

    setMessages([
      assistant({ inputTokens: 50_000, contextWindow: 200_000 }),
      { ...assistant(), isStreaming: true },
    ]);
    expect(fetchPlanUsage).toHaveBeenCalledTimes(1);

    setMessages([
      assistant({ inputTokens: 50_000, contextWindow: 200_000 }),
      assistant({ inputTokens: 60_000, contextWindow: 200_000 }),
    ]);
    expect(await screen.findByText('Plan usage: 15% used')).not.toBeNull();
    expect(fetchPlanUsage).toHaveBeenCalledTimes(2);
  });

  it('says usage is unavailable when the fetch fails', async () => {
    const fetchPlanUsage = vi.fn(async () => {
      throw new Error('HTTP 503');
    });
    act(() => {
      useChatStore.setState({ conversations: [conversation('cloud_managed')] });
    });
    setMessages([assistant({ inputTokens: 50_000, contextWindow: 200_000 })]);

    renderWithBridge(fetchPlanUsage);

    expect(await screen.findByText('Usage unavailable')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not fetch plan usage outside cloud managed mode', async () => {
    const fetchPlanUsage = vi.fn(async () => summary());
    act(() => {
      useChatStore.setState({ conversations: [conversation('byok')] });
    });
    setMessages([assistant({ inputTokens: 50_000, contextWindow: 200_000 })]);

    renderWithBridge(fetchPlanUsage);

    expect((await screen.findByRole('meter')).hasAttribute('aria-describedby')).toBe(false);
    expect(fetchPlanUsage).not.toHaveBeenCalled();
  });

  it('shows plan usage alone before the first context reading', async () => {
    const fetchPlanUsage = vi.fn(async () => summary({ usage_percentage: 42 }));
    act(() => {
      useChatStore.setState({ conversations: [conversation('cloud_managed')] });
    });

    renderWithBridge(fetchPlanUsage);

    const meter = await screen.findByRole('meter', { name: 'Plan usage' });
    expect(meter.getAttribute('aria-valuenow')).toBe('42');
    expect(meter.textContent).toContain('Plan 42%');
    expect(screen.queryByRole('meter', { name: 'Context used' })).toBeNull();
  });

  it('says usage is unavailable before the first context reading when the fetch fails', async () => {
    const fetchPlanUsage = vi.fn(async () => {
      throw new Error('HTTP 503');
    });
    act(() => {
      useChatStore.setState({ conversations: [conversation('cloud_managed')] });
    });

    renderWithBridge(fetchPlanUsage);

    expect(await screen.findByText('Usage unavailable')).not.toBeNull();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('renders nothing without either reading', () => {
    act(() => {
      useChatStore.setState({ conversations: [conversation('byok')] });
    });
    const { container } = renderWithBridge(vi.fn(async () => summary()));
    expect(container.childElementCount).toBe(0);
  });

  it('treats an unprovisioned allocation as unavailable rather than 0%', () => {
    expect(planUsageState(summary({ usage_allocation: 'pending', usage_percentage: 0 }))).toEqual({
      status: 'unavailable',
    });
    expect(planUsageState(summary({ usage_percentage: 140 }))).toEqual({
      status: 'ready',
      percent: 100,
    });
  });
});
