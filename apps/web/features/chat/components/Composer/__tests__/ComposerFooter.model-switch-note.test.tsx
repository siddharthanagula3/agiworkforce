import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}));
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const CACHED_CONVERSATION_ID = 'fixture-conversation';
const HINT_TEXT = 'Switching models here starts a new prompt cache';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const FIXTURE_AVAILABLE_MODELS = vi.hoisted(
  () =>
    [
      {
        id: 'fixture-primary-model',
        name: 'Primary Model',
        provider: 'OpenAI',
        providerKey: 'openai',
      },
      {
        id: 'fixture-secondary-model',
        name: 'Secondary Model',
        provider: 'Anthropic',
        providerKey: 'anthropic',
      },
    ] as Record<string, unknown>[],
);

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => { id: string; name: string; provider: string };
    }) => unknown,
  ) =>
    selector({
      selectedModelId: 'fixture-primary-model',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'fixture-primary-model',
        name: 'Primary Model',
        provider: 'OpenAI',
      }),
    }),
  AVAILABLE_MODELS: FIXTURE_AVAILABLE_MODELS,
  findSelectableModel: (id: string) =>
    FIXTURE_AVAILABLE_MODELS.find((model) => model['id'] === id) ?? null,
  isSelectableModelId: (id: string) => FIXTURE_AVAILABLE_MODELS.some((model) => model['id'] === id),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: { tier: 'max_15x' },
      initialized: true,
      isLoading: false,
      error: null,
    }),
}));

const chatStoreState = vi.hoisted(() => ({
  activeConversationId: null as string | null,
  conversations: [] as { id: string; model?: string | null }[],
  messages: [] as { role: string; isStreaming?: boolean }[],
}));

vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (s: typeof chatStoreState) => unknown) => selector(chatStoreState),
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/config/llm')>()),
  isModelAllowedForTier: () => true,
}));

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div role="dialog" data-testid="popover-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

import { ComposerFooter } from '../ComposerFooter';

const selectSecondaryModel = async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /change model/i }));
  await user.click(screen.getByRole('button', { name: /secondary model/i }));
};

describe('ComposerFooter · model switch is immediate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    chatStoreState.activeConversationId = CACHED_CONVERSATION_ID;
    chatStoreState.messages = [{ role: 'assistant', isStreaming: false }];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits the switch without a confirmation dialog when a cached prefix exists', async () => {
    const onModelChange = vi.fn().mockResolvedValue(true);
    render(<ComposerFooter onModelChange={onModelChange} />);

    await selectSecondaryModel();

    expect(onModelChange).toHaveBeenCalledWith('fixture-secondary-model');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/switch anyway/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keep current model/i)).not.toBeInTheDocument();
  });

  it('names the cache reset inside the picker while a completed turn exists', async () => {
    const onModelChange = vi.fn().mockResolvedValue(true);
    render(<ComposerFooter onModelChange={onModelChange} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /change model/i }));
    expect(screen.getByText(HINT_TEXT)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /secondary model/i }));
    await waitFor(() => expect(onModelChange).toHaveBeenCalledWith('fixture-secondary-model'));
  });

  it('shows no cache hint when the conversation holds no completed assistant turn', async () => {
    chatStoreState.activeConversationId = null;
    chatStoreState.messages = [];
    const onModelChange = vi.fn().mockResolvedValue(true);
    render(<ComposerFooter onModelChange={onModelChange} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /change model/i }));
    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /secondary model/i }));
    await waitFor(() => expect(onModelChange).toHaveBeenCalledWith('fixture-secondary-model'));
  });
});
