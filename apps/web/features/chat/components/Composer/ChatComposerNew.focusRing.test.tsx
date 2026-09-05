import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';

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

function box(): HTMLElement {
  const node = document.querySelector('#chat-composer');
  if (!node) throw new Error('the composer box did not render');
  return node as HTMLElement;
}

describe('composer focus ring', () => {
  it('keeps the resting border neutral', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(box()).toHaveClass('border-[var(--chat-border-strong)]', 'shadow-none');
    expect(box().className).not.toContain('chat-accent-primary');
  });

  it('draws a neutral ring on focus, reserving the accent for the send button', async () => {
    const user = userEvent.setup();
    render(<ChatComposerNew onSend={vi.fn()} />);

    await user.click(screen.getByRole('textbox'));

    expect(box()).toHaveClass(
      'border-[var(--chat-border-strong)]',
      'shadow-md',
      'ring-2',
      'ring-[var(--chat-focus-ring)]',
    );
    expect(box().className).not.toContain('chat-accent-primary');
  });
});
