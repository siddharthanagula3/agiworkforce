import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposerNew } from './ChatComposerNew';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
} from '@agiworkforce/cloud-contracts';

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
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: chatComposerMocks.routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/settings/components/SettingsModalProvider')>()),
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: chatComposerMocks.openSettings,
    closeSettings: vi.fn(),
  }),
}));

vi.mock('@features/chat/hooks/use-skills-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/hooks/use-skills-list')>()),
  useSkillsList: () => ({
    ...chatComposerMocks.skillResult,
  }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/hooks/use-media-model-availability')>()),
  useMediaModelAvailability: () => chatComposerMocks.mediaAvailability,
}));

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/connectors/hooks/use-connectors')>()),
  useConnectors: () => chatComposerMocks.connectors,
}));

vi.mock('@/lib/runtime/memory-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/runtime/memory-capability')>()),
  isMemoryCapabilityEnabled: () => Promise.resolve(chatComposerMocks.memoryCapabilityEnabled),
  subscribeMemoryCapability: (listener: () => void) => {
    chatComposerMocks.memoryCapabilityListeners.add(listener);
    return () => {
      chatComposerMocks.memoryCapabilityListeners.delete(listener);
    };
  },
}));

vi.mock('./SlashCommandMenu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./SlashCommandMenu')>()),
  SlashCommandMenu: () => null,
}));

vi.mock('./SendButton', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./SendButton')>()),
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
  ...(await importOriginal<typeof import('./ComposerFooter')>()),
  ComposerFooter: () => <div data-testid="composer-footer" />,
}));

vi.mock('./VoiceInputButton', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./VoiceInputButton')>()),
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

    dropOnWindow([textFile('dropped.png', 'image/png')]);

    expect(await screen.findByRole('button', { name: 'Remove dropped.png' })).toBeTruthy();
  });

  it('names the files a drop went over the limit by instead of discarding them quietly', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    dropOnWindow(
      Array.from({ length: MAX_CHAT_ATTACHMENT_COUNT + 2 }, (_, index) =>
        textFile(`page-${index}.png`, 'image/png'),
      ),
    );

    expect(
      await screen.findByRole('button', {
        name: `Remove page-${MAX_CHAT_ATTACHMENT_COUNT - 1}.png`,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: `Remove page-${MAX_CHAT_ATTACHMENT_COUNT}.png` }),
    ).toBeNull();
    expect(await screen.findByText(/max 10/i)).toBeTruthy();
  });

  it('attaches an image pasted into the message field', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    pasteImage(screen.getByRole('textbox'), textFile('clipboard.png', 'image/png'));

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

    dropOnWindow([textFile('one.png', 'image/png'), textFile('two.pdf', 'application/pdf')]);
    await screen.findByRole('button', { name: 'Remove one.png' });

    await user.click(screen.getByRole('button', { name: 'Remove one.png' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove one.png' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Remove two.pdf' })).toBeTruthy();
  });
});
