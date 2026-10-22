import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ChatComposerNew, resetSendPendingFlagForTests } from './Composer/ChatComposerNew';
import { WORK_USAGE_COPY } from '@agiworkforce/types';
import { WorkUsageCard } from './WorkUsageCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

vi.mock('@/features/billing/services/stripe-payments', () => ({
  startTopUpCheckout: vi.fn(),
}));

const CONVERSATION_ID = 'work-usage-conversation';
const REASON = 'Usage budget exhausted for this billing period.';
const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

let originalSubscription: SubscriptionPlan | null;

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
  originalSubscription = useBillingStore.getState().subscription;
  useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
});

afterEach(() => {
  useBillingStore.setState({ subscription: originalSubscription });
});

describe('DEF-2332 work usage card', () => {
  it('names the spent Work usage and opens the credit packs from Add credits', () => {
    render(<WorkUsageCard creditTopUpTier="pro" resetLabel="Resets in 2 hours" />);

    const card = screen.getByTestId('work-usage-card');
    expect(within(card).getByRole('heading', { name: WORK_USAGE_COPY.title })).toBeVisible();
    expect(card).toHaveTextContent('Resets in 2 hours.');
    expect(card.textContent).not.toMatch(/\d+%|\$/);

    fireEvent.click(within(card).getByRole('button', { name: WORK_USAGE_COPY.addCredits }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Buy credits' })).toBeVisible();
    expect(within(dialog).getByRole('group', { name: 'Credit pack' })).toBeVisible();
  });

  it('offers the plan recovery instead of credits when credits cannot clear the block', () => {
    const onSelect = vi.fn();
    render(<WorkUsageCard action={{ label: 'Upgrade to Max', onSelect }} />);

    expect(screen.queryByRole('button', { name: WORK_USAGE_COPY.addCredits })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Max' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('replaces the composer strip with the card in AGI Work mode', () => {
    useChatStore.getState().setComposerToggles({ workMode: 'agiwork' }, CONVERSATION_ID);
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={CONVERSATION_ID}
        usageBlock={{
          reason: REASON,
          actionLabel: 'Buy credits',
          onRecover: vi.fn(),
          creditTopUpTier: 'pro',
        }}
      />,
    );

    expect(screen.getByTestId('work-usage-card')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-usage-block')).toBeNull();
    expect(screen.getByRole('button', { name: WORK_USAGE_COPY.addCredits })).toBeVisible();
  });

  it('keeps the compact strip in Chat mode', () => {
    useChatStore.getState().setComposerToggles({ workMode: 'chat' }, CONVERSATION_ID);
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={CONVERSATION_ID}
        usageBlock={{ reason: REASON, creditTopUpTier: 'pro' }}
      />,
    );

    expect(screen.getByTestId('composer-usage-block')).toHaveTextContent(REASON);
    expect(screen.queryByTestId('work-usage-card')).toBeNull();
  });
});
