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
  ComposerModelSummary: () => <span />,
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
  it('renders unconditionally in the composer every chat entry point mounts', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const caveat = screen.getByTestId('ai-accuracy-disclaimer');
    expect(caveat).toHaveTextContent(AI_ACCURACY_DISCLAIMER);
    expect(caveat.textContent?.toLowerCase()).toContain('can make mistakes');
  });

  // Privacy is already reachable from Settings (PrivacySection.tsx), so the
  // one-line footer (disclaimer left, resolved model right) no longer
  // duplicates the link here.
  it('does not duplicate a Privacy link in the footer (reachable from Settings)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /privacy/i })).not.toBeInTheDocument();
  });
});
