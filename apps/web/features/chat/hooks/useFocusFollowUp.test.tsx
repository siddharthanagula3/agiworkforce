import { act, render, screen } from '@testing-library/react';
import { emitAppCommand } from '@shared/lib/app-commands';
import { describe, expect, it } from 'vitest';
import { useFocusFollowUp } from './use-focus-follow-up';

function Harness() {
  useFocusFollowUp();
  return <textarea data-composer-textarea aria-label="Message input" />;
}

describe('Focus Follow-up on the public window', () => {
  it('focuses the composer when the command reaches the chat page', () => {
    render(<Harness />);
    const composer = screen.getByRole('textbox', { name: 'Message input' });
    composer.blur();
    expect(document.activeElement).not.toBe(composer);

    act(() => {
      emitAppCommand('focus-follow-up');
    });

    expect(document.activeElement).toBe(composer);
  });
});
