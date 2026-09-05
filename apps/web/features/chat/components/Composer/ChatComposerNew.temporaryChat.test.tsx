import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';

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
  }),
}));

function openPlusMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /Add attachments and tools/ }));
}

beforeEach(() => {
  useChatStore.getState().reset();
});

describe('temporary chat armed before a conversation exists', () => {
  it('offers the toggle on a brand-new chat with no onSetTemporaryChat host wiring', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    expect(screen.getByRole('button', { name: 'Temporary chat' })).toBeEnabled();
  });

  it('arms the pending flag and checks the menu row, with no composer-face chip', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));

    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);
    // The composer face stays plus, mode pill, Style, model trigger, mic,
    // send; temporary chat surfaces only in this menu and the page header.
    expect(screen.queryByText('Temporary chat')).not.toBeInTheDocument();

    openPlusMenu();
    expect(screen.getByRole('button', { name: 'Temporary chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toggles back off on a second click', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));
    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);

    openPlusMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));
    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });
});
