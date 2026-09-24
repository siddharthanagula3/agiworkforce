import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBillingStore } from '@shared/stores/web-auth-store';
import { MICROPHONE_NOTICE_STORAGE_KEY } from '@features/chat/lib/microphone-notice-copy';
import { useMicrophoneNoticeStore } from '@features/chat/stores/microphone-notice-store';
import { MicrophonePrivacyNotice } from '../MicrophonePrivacyNotice';
import { ChatComposerNew } from './ChatComposerNew';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('next/link', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/link')>()),
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/connectors/hooks/use-connectors')>()),
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

const ACCOUNT = 'user_voice_1';
const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));

function signedIn(accountId: string | null = ACCOUNT): void {
  useBillingStore.setState({ user: accountId ? { id: accountId } : null } as never);
}

function renderChat(onEnterVoiceMode = vi.fn()) {
  const view = render(
    <>
      <MicrophonePrivacyNotice />
      <ChatComposerNew onSend={vi.fn()} onEnterVoiceMode={onEnterVoiceMode} />
    </>,
  );
  return { ...view, onEnterVoiceMode };
}

function notice(): HTMLElement | null {
  return screen.queryByRole('note', { name: 'Where your voice goes' });
}

function dictationButton(): HTMLElement {
  return screen.getByRole('button', { name: /start voice input/i });
}

beforeEach(() => {
  window.localStorage.clear();
  getUserMedia.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  useMicrophoneNoticeStore.setState({ request: null, acknowledgedThisSession: null });
  signedIn();
});

afterEach(() => {
  window.localStorage.clear();
  useBillingStore.setState({ user: null } as never);
  useBillingStore.setState({ disabledFeatures: [] });
});

describe('the first time the microphone is asked for', () => {
  it('does not open it until the reader has been told where the audio goes', async () => {
    renderChat();

    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));

    expect(getUserMedia).not.toHaveBeenCalled();
    const shown = notice();
    expect(shown).toBeTruthy();
    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(document.activeElement).toBe(proceed);
    const described = document.getElementById(proceed.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toContain('AGI does not store the audio.');
    expect(
      screen.getByRole('link', { name: 'How AGI handles your data' }).getAttribute('href'),
    ).toBe('/privacy');

    fireEvent.click(proceed);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
    expect(window.localStorage.getItem(MICROPHONE_NOTICE_STORAGE_KEY)).toBe(ACCOUNT);
  });

  it('sits outside the composer and leaves the composer box exactly as it was', async () => {
    const { container } = renderChat();
    const box = container.querySelector('#chat-composer');
    if (!box) throw new Error('the composer box did not render');
    const before = box.className;

    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));

    const shown = notice();
    if (!shown) throw new Error('the notice did not appear');
    expect(box.contains(shown)).toBe(false);
    expect(box.className).toBe(before);
  });

  it('holds Voice Mode behind the same notice', async () => {
    const { onEnterVoiceMode } = renderChat();

    fireEvent.click(await screen.findByRole('button', { name: 'Start voice mode' }));
    expect(onEnterVoiceMode).not.toHaveBeenCalled();
    expect(notice()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onEnterVoiceMode).toHaveBeenCalledTimes(1);
  });
});

describe('once this account has been told', () => {
  it('opens the microphone in the same click, with nothing shown', async () => {
    window.localStorage.setItem(MICROPHONE_NOTICE_STORAGE_KEY, ACCOUNT);
    renderChat();

    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
  });

  it('takes one acknowledgement for both dictation and Voice Mode', async () => {
    const { onEnterVoiceMode } = renderChat();
    fireEvent.click(await screen.findByRole('button', { name: 'Start voice mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onEnterVoiceMode).toHaveBeenCalledTimes(1);

    fireEvent.click(dictationButton());

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
  });

  it('is still told once more when a different account uses the same browser', async () => {
    window.localStorage.setItem(MICROPHONE_NOTICE_STORAGE_KEY, 'user_someone_else');
    renderChat();

    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(notice()).toBeTruthy();
  });

  it('is told once per session when the browser will not keep the answer', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is full');
    });
    try {
      const { onEnterVoiceMode } = renderChat();
      fireEvent.click(await screen.findByRole('button', { name: 'Start voice mode' }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' }));

      expect(onEnterVoiceMode).toHaveBeenCalledTimes(2);
      expect(notice()).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('declining', () => {
  it('leaves the microphone closed, returns focus, and asks again next time', async () => {
    renderChat();
    const trigger = await screen.findByRole('button', { name: /start voice input/i });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(window.localStorage.getItem(MICROPHONE_NOTICE_STORAGE_KEY)).toBeNull();

    fireEvent.click(dictationButton());
    expect(notice()).toBeTruthy();
  });

  it('answers Escape the same way', async () => {
    renderChat();
    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Continue' }), { key: 'Escape' });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it('drops a request whose composer has gone, so a later Continue opens nothing', async () => {
    const { rerender } = renderChat();
    fireEvent.click(await screen.findByRole('button', { name: /start voice input/i }));
    expect(notice()).toBeTruthy();

    rerender(<MicrophonePrivacyNotice />);

    expect(notice()).toBeNull();
    expect(useMicrophoneNoticeStore.getState().request).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('while the server holds dictation off', () => {
  it('shows the microphone as unavailable with the reason and never opens it', async () => {
    window.localStorage.setItem(MICROPHONE_NOTICE_STORAGE_KEY, ACCOUNT);
    useBillingStore.setState({ disabledFeatures: [{ capability: 'dictation', reason: null }] });
    renderChat();

    const microphone = await screen.findByRole('button', {
      name: 'Dictation is temporarily switched off while we investigate a problem with it.',
    });
    expect(microphone.hasAttribute('disabled')).toBe(true);
    fireEvent.click(microphone);

    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
