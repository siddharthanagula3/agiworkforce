import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rewindMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: framer-motion motion proxy
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  codeEditing: { codingCheckpointRewind: (...args: unknown[]) => rewindMock(...args) },
}));

vi.mock('../../../stores/codingCheckpointStore', () => ({
  forgetCheckpointAvailability: vi.fn(),
  useCheckpointAvailability: () => 'available',
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args), success: vi.fn() },
}));

import { ToolLabel, type ToolLabelEntry } from '../ToolLabel';

const editEntry: ToolLabelEntry = {
  id: 'edit-1',
  displayName: 'Edit',
  displayArgs: 'src/main.rs',
  status: 'completed',
  durationMs: 45,
  resultPreview: '-old line\n+new line',
  checkpointId: 'checkpoint-1',
};

async function openUndoQuestion() {
  const user = userEvent.setup();
  render(<ToolLabel entry={editEntry} />);
  await user.click(screen.getByRole('button', { name: 'Expand output' }));
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  return { user, dialog: await screen.findByRole('alertdialog') };
}

describe('undoing an edit from its tool label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewindMock.mockResolvedValue(['src/main.rs']);
  });

  it('asks first and says what is lost', async () => {
    const { dialog } = await openUndoQuestion();

    expect(dialog).toHaveTextContent('Undo this change?');
    expect(dialog).toHaveTextContent('by the assistant or by you, is lost');
    expect(rewindMock).not.toHaveBeenCalled();
  });

  it('rewinds only after the person confirms', async () => {
    const { user, dialog } = await openUndoQuestion();

    await user.click(within(dialog).getByRole('button', { name: 'Undo change' }));

    await waitFor(() => expect(rewindMock).toHaveBeenCalledWith('checkpoint-1'));
  });

  it('changes nothing when the question is cancelled', async () => {
    const { user, dialog } = await openUndoQuestion();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(rewindMock).not.toHaveBeenCalled();
  });

  it('shows the reason the host gave when it refuses', async () => {
    const refused =
      '/etc/hosts is outside the folders you have allowed. Add its folder in Settings, Allowed Directories, or open it as the project folder.';
    rewindMock.mockRejectedValue(refused);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user, dialog } = await openUndoQuestion();

    await user.click(within(dialog).getByRole('button', { name: 'Undo change' }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('This change was not undone', {
        description: refused,
      }),
    );
    consoleError.mockRestore();
  });
});
