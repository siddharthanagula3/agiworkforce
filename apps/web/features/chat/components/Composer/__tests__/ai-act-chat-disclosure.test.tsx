import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatComposerNew } from '../ChatComposerNew';
import { AI_INTERACTION_DISCLOSURE } from '@/lib/compliance/ai-act';

/**
 * EU AI Act Article 50(1) — a natural person must be informed that they are
 * interacting with an AI system. Every web chat entry point (the chat page and
 * the project detail page) mounts `ChatComposerNew`, so the disclosure has to
 * live there and be unconditional; a banner shown only on first run, or only
 * when some flag is set, does not satisfy 50(1) for later sessions.
 */

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

vi.mock('../DragDropOverlay', () => ({ DragDropOverlay: () => null }));
vi.mock('../SlashCommandMenu', () => ({ SlashCommandMenu: () => null }));
vi.mock('../ComposerFooter', () => ({ ComposerFooter: () => <div /> }));
vi.mock('../SendButton', () => ({
  SendButton: () => <button type="button">Send</button>,
}));
vi.mock('../VoiceInputButton', () => ({
  VoiceInputButton: () => <button type="button">Voice</button>,
}));

describe('Article 50(1) — AI interaction disclosure', () => {
  it('renders the disclosure in the composer every chat entry point mounts', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    // The wording is load-bearing, not decorative: the old footer said only
    // "AGI can make mistakes", an accuracy caveat that discloses nothing about
    // the counterpart being an AI. Asserted against the rendered text, not
    // against the constant, so this fails if either the constant or the
    // composer regresses.
    const disclosure = screen.getByTestId('ai-act-interaction-disclosure');
    expect(disclosure).toHaveTextContent(AI_INTERACTION_DISCLOSURE);
    expect(disclosure.textContent?.toLowerCase()).toContain('interacting with an ai system');
  });
});
