import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConversationInstructionsDialog } from '../ConversationInstructionsDialog';

describe('ConversationInstructionsDialog', () => {
  it('saves the trimmed instructions and closes', async () => {
    const onSave = vi.fn(async () => true);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationInstructionsDialog
        open
        instructions=""
        onOpenChange={onOpenChange}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('Instructions'), '  Answer in Spanish.  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('Answer in Spanish.');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('offers to remove saved instructions once the text is cleared', async () => {
    const onSave = vi.fn(async () => true);
    const user = userEvent.setup();
    render(
      <ConversationInstructionsDialog
        open
        instructions="Answer in Spanish."
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText('Instructions'));
    await user.click(screen.getByRole('button', { name: 'Remove instructions' }));

    expect(onSave).toHaveBeenCalledWith('');
  });

  it('stays open and says so when the save fails', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationInstructionsDialog
        open
        instructions=""
        onOpenChange={onOpenChange}
        onSave={vi.fn(async () => false)}
      />,
    );

    await user.type(screen.getByLabelText('Instructions'), 'Be brief.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your instructions were not saved. Try again.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
