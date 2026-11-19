import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocalQueuedMessages } from './LocalQueuedMessages';

const item = { id: 'queued-1', text: 'first', images: [], contextFiles: [] };

function renderQueue(onEditingChange = vi.fn()) {
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  render(
    <LocalQueuedMessages
      queued={[item]}
      paused={false}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onSendNow={vi.fn()}
      onEditingChange={onEditingChange}
    />,
  );
  return { onEditingChange, onUpdate, onRemove };
}

describe('LocalQueuedMessages editing', () => {
  it('tells the session while a queued message is being edited and when the edit ends', async () => {
    const user = userEvent.setup();
    const { onEditingChange, onUpdate } = renderQueue();

    expect(onEditingChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditingChange).toHaveBeenLastCalledWith('queued-1', true);

    await user.clear(screen.getByRole('textbox', { name: 'Queued message' }));
    await user.type(screen.getByRole('textbox', { name: 'Queued message' }), 'rewritten');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith('queued-1', 'rewritten');
    expect(onEditingChange).toHaveBeenLastCalledWith('queued-1', false);
  });

  it('releases the hold when the edited message leaves the queue', async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    const props = {
      paused: false,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onSendNow: vi.fn(),
      onEditingChange,
    };
    const { rerender } = render(<LocalQueuedMessages queued={[item]} {...props} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    rerender(<LocalQueuedMessages queued={[]} {...props} />);

    expect(onEditingChange).toHaveBeenLastCalledWith('queued-1', false);
  });
});
