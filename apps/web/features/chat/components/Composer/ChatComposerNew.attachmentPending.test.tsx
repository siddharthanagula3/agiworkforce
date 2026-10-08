import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
type ScanModule0 = typeof import('next/navigation');
type ScanModule1 = typeof import('@features/settings/components/SettingsModalProvider');
type ScanModule2 = typeof import('@features/chat/hooks/use-skills-list');
type ScanModule3 = typeof import('@features/chat/hooks/use-media-model-availability');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('@features/connectors/hooks/use-connectors');
type AttachmentMetadataModule = typeof import('@features/chat/lib/attachment-metadata');
type PreparedAttachment = Awaited<ReturnType<AttachmentMetadataModule['prepareChatAttachment']>>;

const preparation = vi.hoisted(() => ({
  prepareChatAttachment: vi.fn<(file: File) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  useCapability: () => false,
}));

vi.mock('@features/chat/lib/attachment-metadata', async (importOriginal) => ({
  ...(await importOriginal<AttachmentMetadataModule>()),
  prepareChatAttachment: preparation.prepareChatAttachment,
}));

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
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

/** Holds a picked file in preparation so a send can be attempted underneath it. */
function pendingAttachment() {
  let finish: (prepared: PreparedAttachment) => void = () => undefined;
  preparation.prepareChatAttachment.mockImplementation(
    () =>
      new Promise<PreparedAttachment>((resolve) => {
        finish = resolve;
      }),
  );
  return { settle: (file: File) => finish({ status: 'ready', file }) };
}

function pickFile(container: HTMLElement, file: File) {
  const picker = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!picker) throw new Error('The composer has no file picker');
  fireEvent.change(picker, { target: { files: [file] } });
}

beforeEach(() => {
  resetSendPendingFlagForTests();
});

afterEach(() => {
  resetSendPendingFlagForTests();
  vi.restoreAllMocks();
});

describe('a send raced against an attachment that is still being prepared', () => {
  it('holds the message until the file is ready instead of sending without it', async () => {
    const attachment = pendingAttachment();
    const file = new File(['picture'], 'photo.png', { type: 'image/png' });
    const onSend = vi.fn();
    const { container } = render(<ChatComposerNew onSend={onSend} />);

    pickFile(container, file);
    await waitFor(() => {
      expect(preparation.prepareChatAttachment).toHaveBeenCalledTimes(1);
    });
    await userEvent.type(input(), 'look at this');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
    expect((input() as HTMLTextAreaElement).value).toContain('look at this');

    attachment.settle(file);

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    expect(onSend.mock.calls[0]?.[0]).toContain('look at this');
    expect(onSend.mock.calls[0]?.[1]).toEqual([file]);
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
