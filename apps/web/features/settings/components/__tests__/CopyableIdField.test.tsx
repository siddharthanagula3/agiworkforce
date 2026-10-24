import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyableIdField } from '../CopyableIdField';

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('CopyableIdField', () => {
  it('copies the value', async () => {
    render(
      <CopyableIdField id="f" label="User ID" value="user_123" hint="h" copyLabel="Copy user ID" />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy user ID' }));

    expect(writeText).toHaveBeenCalledWith('user_123');
  });

  it('disables the button when there is nothing to copy', () => {
    render(<CopyableIdField id="f" label="User ID" value={null} hint="h" copyLabel="Copy" />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('does not throw when the clipboard refuses', async () => {
    // Clipboard access is refused in a non-secure context or without
    // permission. The value stays selectable, so failing quietly beats an error
    // about something the user can still do by hand.
    writeText.mockRejectedValue(new Error('denied'));
    render(<CopyableIdField id="f" label="User ID" value="u" hint="h" copyLabel="Copy" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('keeps the value readable rather than hiding it behind the button', () => {
    render(<CopyableIdField id="f" label="User ID" value="user_123" hint="h" copyLabel="Copy" />);

    expect(screen.getByLabelText('User ID')).toHaveValue('user_123');
  });
});
