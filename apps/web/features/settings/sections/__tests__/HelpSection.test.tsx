import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { primaryModifierLabel } from '@agiworkforce/ui';
import { KEYBOARD_SHORTCUT_DOCS } from '@features/chat/hooks/use-keyboard-shortcuts';
import { HelpSection } from '../HelpSection';

describe('HelpSection keyboard shortcuts hint', () => {
  it('quotes the binding the chat surface actually listens for', () => {
    const documented = KEYBOARD_SHORTCUT_DOCS.find(
      (shortcut) => shortcut.description === 'Show keyboard shortcuts',
    );
    if (!documented) throw new Error('Chat must document a show-shortcuts binding');

    render(<HelpSection />);

    const hint = screen.getByText(/anywhere in chat to see the full list/i);
    expect(hint.textContent).toContain(primaryModifierLabel());
    expect(hint.textContent).toContain(documented.key);
    expect(hint.textContent).not.toMatch(/Press\s+\?/);
  });
});
