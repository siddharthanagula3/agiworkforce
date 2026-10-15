import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setGlobalInstructions = vi.fn();
const setGlobalInstructionsEnabled = vi.fn();
const customInstructionsState = {
  globalInstructions: 'Use metric units.',
  globalInstructionsEnabled: true,
  maxInstructionsLength: 10000,
  setGlobalInstructions,
  setGlobalInstructionsEnabled,
};

vi.mock('../../../stores/customInstructionsStore', () => ({
  useCustomInstructionsStore: Object.assign(
    (selector: (state: typeof customInstructionsState) => unknown) =>
      selector(customInstructionsState),
    { getState: () => customInstructionsState },
  ),
}));

const getConversationInstructions = vi.fn<(id: number) => Promise<string>>(async () => 'Be brief.');
const setConversationInstructions = vi.fn<(id: number, text: string) => Promise<void>>(
  async () => undefined,
);
const localConversationId = vi.fn((id: string | undefined) => (id === 'chat-1' ? 42 : null));

vi.mock('../conversationInstructions', () => ({
  getConversationInstructions: (id: number) => getConversationInstructions(id),
  setConversationInstructions: (id: number, text: string) => setConversationInstructions(id, text),
  localConversationId: (id: string | undefined) => localConversationId(id),
}));

import { CustomInstructionsDialog } from '../CustomInstructionsDialog';

describe('CustomInstructionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads this chat's saved instructions and saves edits to the local database", async () => {
    const onOpenChange = vi.fn();
    render(<CustomInstructionsDialog open onOpenChange={onOpenChange} conversationId="chat-1" />);

    const textarea = await screen.findByLabelText('Instructions for this conversation');
    await waitFor(() => expect(textarea).toHaveValue('Be brief.'));
    expect(getConversationInstructions).toHaveBeenCalledWith(42);

    fireEvent.change(textarea, { target: { value: '  Reply in bullet points.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));

    await waitFor(() =>
      expect(setConversationInstructions).toHaveBeenCalledWith(42, 'Reply in bullet points.'),
    );
    expect(setGlobalInstructions).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and says so when saving fails', async () => {
    setConversationInstructions.mockRejectedValueOnce(new Error('database locked'));
    const onOpenChange = vi.fn();
    render(<CustomInstructionsDialog open onOpenChange={onOpenChange} conversationId="chat-1" />);

    const textarea = await screen.findByLabelText('Instructions for this conversation');
    await waitFor(() => expect(textarea).toHaveValue('Be brief.'));
    fireEvent.change(textarea, { target: { value: 'Changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your instructions were not saved. database locked',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cannot set chat instructions before the chat exists locally', async () => {
    render(<CustomInstructionsDialog open onOpenChange={vi.fn()} conversationId="draft-chat" />);

    expect(await screen.findByLabelText('Instructions for this conversation')).toBeDisabled();
    expect(getConversationInstructions).not.toHaveBeenCalled();
  });
});
