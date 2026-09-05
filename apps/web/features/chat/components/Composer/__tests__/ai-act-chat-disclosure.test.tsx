import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatComposerNew } from '../ChatComposerNew';
import { AI_ACCURACY_DISCLAIMER } from '@/lib/compliance/ai-act';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
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
    admissionFor: () => undefined,
    retry: vi.fn(),
  }),
}));

vi.mock('../DragDropOverlay', () => ({ DragDropOverlay: () => null }));
vi.mock('../SlashCommandMenu', () => ({ SlashCommandMenu: () => null }));
vi.mock('../ComposerFooter', () => ({
  ComposerFooter: () => <div />,
}));
vi.mock('../SendButton', () => ({
  SendButton: () => <button type="button">Send</button>,
}));
vi.mock('../VoiceInputButton', () => ({
  VoiceInputButton: () => <button type="button">Voice</button>,
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  }),
}));

describe('composer accuracy caveat', () => {
  it('no longer paints the line under the card (removed by the founder on 2026-09-05)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(screen.queryByTestId('ai-accuracy-disclaimer')).not.toBeInTheDocument();
    expect(screen.queryByText(AI_ACCURACY_DISCLAIMER)).not.toBeInTheDocument();
  });

  it('leaves nothing in its place, footer entries included', () => {
    const { container } = render(<ChatComposerNew onSend={vi.fn()} />);

    expect(container.querySelector('[data-testid^="composer-footer-entry-"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /privacy/i })).not.toBeInTheDocument();
  });
});
