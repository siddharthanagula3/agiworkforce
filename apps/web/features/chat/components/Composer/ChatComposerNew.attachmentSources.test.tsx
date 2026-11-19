import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposerNew } from './ChatComposerNew';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { chatAttachmentAcceptAttribute } from '@agiworkforce/cloud-contracts';
import { getPlanMaxAttachmentsPerMessage } from '@agiworkforce/types';

const PRO_ATTACHMENTS_PER_MESSAGE = getPlanMaxAttachmentsPerMessage('pro');
import {
  PICTURE_NEEDLE,
  bytesOf,
  includesText,
  jpegWithLocation,
  jpegWithLocationBytes,
  onePixelPng,
} from '@features/chat/lib/__tests__/picture-fixtures';
type ScanModule0 = typeof import('next/navigation');
type ScanModule1 = typeof import('@features/settings/components/SettingsModalProvider');
type ScanModule2 = typeof import('@features/chat/hooks/use-skills-list');
type ScanModule3 = typeof import('@features/chat/hooks/use-media-model-availability');
type ScanModule4 = typeof import('@features/connectors/hooks/use-connectors');
type ScanModule5 = typeof import('@/lib/runtime/memory-capability');
type ScanModule6 = typeof import('./SlashCommandMenu');
type ScanModule7 = typeof import('./SendButton');
type ScanModule8 = typeof import('./ComposerFooter');
type ScanModule9 = typeof import('./VoiceInputButton');

const chatComposerMocks = vi.hoisted(() => ({
  skillResult: {
    skills: [
      {
        name: 'backend-engineer',
        description: 'Backend implementation support',
        source: 'bundled',
      },
    ] as Array<{ name: string; description: string; source: string; requiredTools?: string[] }>,
    loading: false,
    error: null as string | null,
  },
  openSettings: vi.fn(),
  routerPush: vi.fn(),
  mediaAvailability: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    error: null as string | null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  },
  connectors: {
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  },
  memoryCapabilityEnabled: true,
  memoryCapabilityListeners: new Set<() => void>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  useRouter: () => ({
    push: chatComposerMocks.routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: chatComposerMocks.openSettings,
    closeSettings: vi.fn(),
  }),
}));

vi.mock('@features/chat/hooks/use-skills-list', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  useSkillsList: () => ({
    ...chatComposerMocks.skillResult,
  }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  useMediaModelAvailability: () => chatComposerMocks.mediaAvailability,
}));

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  useConnectors: () => chatComposerMocks.connectors,
}));

vi.mock('@/lib/runtime/memory-capability', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  isMemoryCapabilityEnabled: () => Promise.resolve(chatComposerMocks.memoryCapabilityEnabled),
  subscribeMemoryCapability: (listener: () => void) => {
    chatComposerMocks.memoryCapabilityListeners.add(listener);
    return () => {
      chatComposerMocks.memoryCapabilityListeners.delete(listener);
    };
  },
}));

vi.mock('./SlashCommandMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  SlashCommandMenu: () => null,
}));

vi.mock('./SendButton', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  SendButton: ({
    onClick,
    disabled,
    mode,
  }: {
    onClick: () => void;
    disabled: boolean;
    mode: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-mode={mode} aria-label="Send message">
      {mode === 'stop' ? 'Stop' : 'Send'}
    </button>
  ),
}));

vi.mock('./ComposerFooter', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  ComposerFooter: () => <div data-testid="composer-footer" />,
}));

vi.mock('./VoiceInputButton', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  VoiceInputButton: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" aria-label="Voice input" disabled={disabled}>
      Voice
    </button>
  ),
}));

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

function textFile(name: string, type: string, size = 32): File {
  const file = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function dropOnWindow(files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: { files: File[]; types: string[] };
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: ['Files'] },
  });
  fireEvent(window, event);
}

function pasteImage(field: HTMLElement, file: File): void {
  fireEvent.paste(field, {
    clipboardData: {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files'],
      getData: () => '',
    },
  });
}

describe('ChatComposerNew attachment sources', () => {
  beforeEach(() => {
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });
  });

  afterEach(() => {
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });
    vi.unstubAllGlobals();
  });

  it('attaches what the device file picker returns', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const input = screen.getByLabelText('File upload') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [textFile('brief.pdf', 'application/pdf')] } });

    expect(await screen.findByRole('button', { name: 'Remove brief.pdf' })).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('offers every attachment type the shared contract allows, and no others', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const input = screen.getByLabelText('File upload') as HTMLInputElement;

    expect(input.accept).toBe(chatAttachmentAcceptAttribute());
    expect(input.multiple).toBe(true);
  });

  it('attaches files dropped anywhere on the page', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    dropOnWindow([onePixelPng('dropped.png')]);

    expect(await screen.findByRole('button', { name: 'Remove dropped.png' })).toBeTruthy();
  });

  it('names the files a drop went over the limit by instead of discarding them quietly', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    dropOnWindow(
      Array.from({ length: PRO_ATTACHMENTS_PER_MESSAGE + 2 }, (_, index) =>
        onePixelPng(`page-${index}.png`),
      ),
    );

    expect(
      await screen.findByRole('button', {
        name: `Remove page-${PRO_ATTACHMENTS_PER_MESSAGE - 1}.png`,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: `Remove page-${PRO_ATTACHMENTS_PER_MESSAGE}.png` }),
    ).toBeNull();
    expect(
      await screen.findByText(
        `"page-${PRO_ATTACHMENTS_PER_MESSAGE + 1}.png" (over the ${PRO_ATTACHMENTS_PER_MESSAGE}-file limit)`,
        { exact: false },
      ),
    ).toBeTruthy();
  });

  it('attaches an image pasted into the message field', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    pasteImage(screen.getByRole('textbox'), onePixelPng('clipboard.png'));

    expect(await screen.findByRole('button', { name: /^Remove /i })).toBeTruthy();
  });

  it('says why a file it cannot take was refused rather than ignoring the drop', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    dropOnWindow([textFile('installer.exe', 'application/x-msdownload')]);

    expect(await screen.findByText(/unsupported file type/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove installer.exe' })).toBeNull();
  });

  it('removes one attachment without disturbing the others', async () => {
    const user = userEvent.setup();
    render(<ChatComposerNew onSend={vi.fn()} />);

    dropOnWindow([onePixelPng('one.png'), textFile('two.pdf', 'application/pdf')]);
    await screen.findByRole('button', { name: 'Remove one.png' });

    await user.click(screen.getByRole('button', { name: 'Remove one.png' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove one.png' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Remove two.pdf' })).toBeTruthy();
  });

  it('sends a dropped photo without the camera and place it was taken', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    dropOnWindow([jpegWithLocation('beach.jpg')]);
    await screen.findByRole('button', { name: 'Remove beach.jpg' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Where is this?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const sent = (onSend.mock.calls[0]?.[1] as File[] | undefined)?.[0];
    if (!sent) throw new Error('the photo was not sent');
    const bytes = await bytesOf(sent);
    expect(includesText(bytes, PICTURE_NEEDLE.camera)).toBe(false);
    expect(includesText(bytes, PICTURE_NEEDLE.pixels)).toBe(true);
  });

  it('refuses a photo it cannot clean, says so, and names it in the turn', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    const whole = jpegWithLocationBytes();
    const cut = new File([whole.subarray(0, whole.length - 2)], 'cut.jpg', {
      type: 'image/jpeg',
    });

    dropOnWindow([cut]);

    expect(
      await screen.findByText(
        '"cut.jpg" was not attached. The location and camera details in a picture are removed before it leaves your device, and this file could not be read well enough to do that. Save a copy from a photo app and attach that instead.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove cut.jpg' })).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Where is this?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toContain(
      '[attachment unavailable: cut.jpg could not be sent because the location and camera details in it could not be removed.]',
    );
    expect(onSend.mock.calls[0]?.[1]).toBeUndefined();
  });
});

const clipboardFixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, userId: null, sessionId: null },
  sdk: { loaded: true, user: null, session: null },
  read: vi.fn<() => Promise<{ text?: string; textTruncated: boolean }>>(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => clipboardFixture.auth,
  useClerk: () => clipboardFixture.sdk,
  useUser: () => ({
    isLoaded: clipboardFixture.auth.isLoaded,
    isSignedIn: clipboardFixture.auth.isSignedIn,
    user: clipboardFixture.sdk.user,
  }),
}));

type DesktopHostModule = typeof import('@/features/desktop-host');
vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<DesktopHostModule>()),
  readHostClipboard: clipboardFixture.read,
}));

type PlusMenuModule = typeof import('./ComposerPlusMenu');
vi.mock('./ComposerPlusMenu', async (importOriginal) => ({
  ...(await importOriginal<PlusMenuModule>()),
  ComposerPlusMenu: ({
    onAttachClipboard,
    isReadingClipboard,
  }: {
    onAttachClipboard: () => void;
    isReadingClipboard: boolean;
  }) => (
    <button onClick={onAttachClipboard} disabled={isReadingClipboard}>
      Attach clipboard
    </button>
  ),
}));

function pendingClipboard() {
  let resolve!: (snapshot: { text?: string; textTruncated: boolean }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ text?: string; textTruncated: boolean }>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  clipboardFixture.read.mockReturnValueOnce(promise);
  return { resolve, reject };
}

describe('deferred clipboard ownership in the real composer', () => {
  beforeEach(() => {
    clipboardFixture.auth.isLoaded = true;
    clipboardFixture.sdk.loaded = true;
    useChatStore.getState().reset();
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  });

  it('attaches a stable signed-out read without requiring session authority', async () => {
    const pending = pendingClipboard();
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    expect(clipboardFixture.read).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Attach clipboard' })).toBeDisabled();
    await act(async () => pending.resolve({ text: 'local clipboard', textTruncated: false }));
    expect(await screen.findByRole('button', { name: /^Remove clipboard-.*\.txt$/ })).toBeTruthy();
  });

  it('tells the user when the clipboard text was cut short', async () => {
    const pending = pendingClipboard();
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    await act(async () => pending.resolve({ text: 'long text', textTruncated: true }));
    expect(await screen.findByRole('button', { name: /^Remove clipboard-.*\.txt$/ })).toBeTruthy();
    expect(
      screen.getByText(
        'The clipboard text was too long, so only the first part was attached. Attach the original file to include all of it.',
      ),
    ).toBeTruthy();
  });

  it('discards late data after the rendered draft changes', async () => {
    const pending = pendingClipboard();
    const { rerender } = render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    rerender(<ChatComposerNew onSend={vi.fn()} conversationId="conversation-b" />);
    await act(async () => pending.resolve({ text: 'old draft data', textTruncated: false }));
    expect(screen.queryByRole('button', { name: /^Remove clipboard-/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Attach clipboard' })).toBeEnabled();
  });

  it('discards a late empty result after live identity readiness changes', async () => {
    const pending = pendingClipboard();
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    clipboardFixture.sdk.loaded = false;
    await act(async () => pending.resolve({ textTruncated: false }));
    expect(
      screen.queryByText('Your clipboard is empty, so there was nothing to attach.'),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Attach clipboard' })).toBeEnabled();
  });

  it('discards a late error after navigation and does not unblock the newer read', async () => {
    const first = pendingClipboard();
    const { rerender } = render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    rerender(<ChatComposerNew onSend={vi.fn()} conversationId="conversation-b" />);
    const second = pendingClipboard();
    fireEvent.click(screen.getByRole('button', { name: 'Attach clipboard' }));
    await act(async () => first.reject(new Error('old clipboard failure')));
    expect(screen.queryByText('The clipboard could not be read.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Attach clipboard' })).toBeDisabled();
    await act(async () => second.resolve({ text: 'new draft data', textTruncated: false }));
    expect(await screen.findByRole('button', { name: /^Remove clipboard-.*\.txt$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach clipboard' })).toBeEnabled();
  });
});
