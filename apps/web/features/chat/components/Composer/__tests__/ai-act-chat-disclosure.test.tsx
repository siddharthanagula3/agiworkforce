import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatComposerNew } from '../ChatComposerNew';
import { AI_ACCURACY_DISCLAIMER } from '@/lib/compliance/ai-act';

/**
 * The composer's standing caveat.
 *
 * This file used to assert the explicit Article 50(1) sentence "You are
 * interacting with an AI system". That was removed on 2026-08-14 in reliance on
 * the regulation's carve-out for cases where the fact is obvious from context —
 * the position ChatGPT and Claude visibly take. `lib/compliance/ai-act.ts`
 * carries the full reasoning.
 *
 * The test was NOT deleted along with the sentence, because the thing worth
 * guarding did not go away: the accuracy caveat must still be unconditional and
 * must still live in the one composer every web chat entry point mounts. A
 * caveat shown only on first run, or only behind a flag, is not a caveat for
 * later sessions — that was true of the disclosure and is equally true of this.
 *
 * It also guards the DIRECTION of the trim. The change was justified by ChatGPT
 * and Claude showing less; both of them DO show an accuracy caveat here, so
 * removing this one too would take the product below the comparators used to
 * argue for the change.
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

describe('composer accuracy caveat', () => {
  it('renders unconditionally in the composer every chat entry point mounts', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const caveat = screen.getByTestId('ai-accuracy-disclaimer');
    expect(caveat).toHaveTextContent(AI_ACCURACY_DISCLAIMER);
    // Asserted against rendered text as well as the constant, so emptying the
    // constant does not silently satisfy the test.
    expect(caveat.textContent?.toLowerCase()).toContain('can make mistakes');
  });

  it('keeps the in-app route to the privacy notice next to it', () => {
    // The signed-in app shell renders no legal footer, so this link and one in
    // Settings are the only in-app routes to the notice. It was kept
    // deliberately when the Article 50(1) sentence beside it was removed;
    // this asserts the next trim does not take it by accident.
    render(<ChatComposerNew onSend={vi.fn()} />);

    const privacy = screen.getByRole('link', { name: /privacy/i });
    expect(privacy).toHaveAttribute('href', '/privacy');
  });
});
