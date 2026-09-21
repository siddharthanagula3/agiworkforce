import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
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

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

/**
 * The keycode every browser reports for a keydown the input method consumed.
 */
const IME_PROCESSING_KEY_CODE = 229;

type SendHandler = ComponentProps<typeof ChatComposerNew>['onSend'];

async function composerWithDraft(onSend: SendHandler) {
  render(<ChatComposerNew onSend={onSend} />);
  const textarea = screen.getByRole('textbox', { name: /message input/i });
  await userEvent.type(textarea, 'こんにち');
  return textarea;
}

describe('composer Enter during input-method composition', () => {
  it('does not send when the keydown carries the IME processing keycode and isComposing is absent', async () => {
    const onSend = vi.fn<SendHandler>();
    const textarea = await composerWithDraft(onSend);

    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send when the keydown reports isComposing', async () => {
    const onSend = vi.fn<SendHandler>();
    const textarea = await composerWithDraft(onSend);

    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on the Enter that follows composition, which carries neither marker', async () => {
    const onSend = vi.fn<SendHandler>();
    const textarea = await composerWithDraft(onSend);

    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });
    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    expect(onSend.mock.calls[0]?.[0]).toBe('こんにち');
  });

  it('leaves the draft in the field when the IME keydown is ignored', async () => {
    const onSend = vi.fn<SendHandler>();
    const textarea = await composerWithDraft(onSend);

    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect((textarea as HTMLTextAreaElement).value).toBe('こんにち');
  });
});
