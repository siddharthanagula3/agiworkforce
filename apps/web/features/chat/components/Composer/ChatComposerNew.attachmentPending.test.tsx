import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/settings/components/SettingsModalProvider')>()),
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/hooks/use-skills-list')>()),
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/hooks/use-media-model-availability')>()),
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/unified-chat')>()),
  useCapability: (capability: string) => capability === 'canTakeScreenshot',
}));

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/connectors/hooks/use-connectors')>()),
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function reason() {
  return screen.queryByTestId('composer-send-disabled-reason');
}

/** Holds the screen capture open so a send can be attempted underneath it. */
function pendingCapture() {
  let fail: (error: Error) => void = () => undefined;
  const getDisplayMedia = vi.fn(
    () =>
      new Promise<MediaStream>((_resolve, reject) => {
        fail = reject;
      }),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  });
  return { cancel: () => fail(new Error('cancelled')) };
}

async function startScreenshot() {
  await userEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
  await userEvent.click(await screen.findByText('Take a screenshot'));
}

beforeEach(() => {
  resetSendPendingFlagForTests();
});

afterEach(() => {
  resetSendPendingFlagForTests();
  vi.restoreAllMocks();
});

describe('a send raced against an attachment that is still being prepared', () => {
  it('holds the message until the capture ends instead of sending without it', async () => {
    const capture = pendingCapture();
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    await startScreenshot();
    await userEvent.type(input(), 'look at this');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
    expect((input() as HTMLTextAreaElement).value).toContain('look at this');

    capture.cancel();

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    expect(onSend.mock.calls[0]?.[0]).toContain('look at this');
  });
});

describe('the reason a shut send control gives to a screen reader', () => {
  it('names the empty draft rather than claiming it will send', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const control = screen.getByRole('button', { name: /send message/i });
    expect(control).toBeDisabled();
    expect(control.getAttribute('aria-describedby')).toBe(reason()?.id);
    expect(reason()?.textContent).toContain('type a message or attach a file');
  });

  it('names the usage limit the refusal carried', async () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        usageBlock={{ reason: 'You have used every message on the free plan today.' }}
      />,
    );
    await userEvent.type(input(), 'hello');

    await waitFor(() => {
      expect(reason()?.textContent).toContain('every message on the free plan today');
    });
  });

  it('carries no reason while the control can actually send', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    await userEvent.type(input(), 'hello');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
    });
    expect(reason()).toBeNull();
  });
});
