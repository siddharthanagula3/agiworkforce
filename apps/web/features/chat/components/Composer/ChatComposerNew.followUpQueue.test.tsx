import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
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
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

async function queue(text: string) {
  const textarea = screen.getByRole('textbox', { name: /message input/i });
  await userEvent.type(textarea, text);
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

describe('follow-up queue holds more than one message (COMPOSER-005)', () => {
  it('keeps both follow-ups instead of letting the second overwrite the first', async () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatComposerNew onSend={onSend} isLoading isGenerating />);

    await queue('first follow up');
    await queue('second follow up');

    expect(screen.getAllByTestId('queued-followup')).toHaveLength(2);
    expect(screen.getByText(/first follow up/)).not.toBeNull();
    expect(screen.getByText(/second follow up/)).not.toBeNull();

    // One message per finished turn: the server rejects concurrent turns on a
    // conversation, so the queue must not flush everything at once.
    rerender(<ChatComposerNew onSend={onSend} isLoading={false} isGenerating={false} />);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('first follow up');
    expect(screen.getAllByTestId('queued-followup')).toHaveLength(1);

    rerender(<ChatComposerNew onSend={onSend} isLoading isGenerating />);
    rerender(<ChatComposerNew onSend={onSend} isLoading={false} isGenerating={false} />);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[1]?.[0]).toBe('second follow up');
    expect(screen.queryAllByTestId('queued-followup')).toHaveLength(0);
  });

  it('cancels one queued message without dropping the others', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} isLoading isGenerating />);

    await queue('keep me');
    await queue('drop me');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued message: drop me' }));

    expect(screen.getAllByTestId('queued-followup')).toHaveLength(1);
    expect(screen.getByText(/keep me/)).not.toBeNull();
  });

  it('edits a queued message in place rather than appending a duplicate', async () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatComposerNew onSend={onSend} isLoading isGenerating />);

    await queue('typo herre');
    await queue('second follow up');

    fireEvent.click(screen.getByRole('button', { name: 'Edit queued message: typo herre' }));
    const textarea = screen.getByRole('textbox', { name: /message input/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('typo herre');

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'typo here' } });
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.getAllByTestId('queued-followup')).toHaveLength(2);
    expect(screen.queryByText(/typo herre/)).toBeNull();

    rerender(<ChatComposerNew onSend={onSend} isLoading={false} isGenerating={false} />);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('typo here');
  });
});
