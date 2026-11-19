import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { READ_ALOUD_UNAVAILABLE_REASON } from '@/src/features/voice/services/readAloudAvailability';
import type { ChatMessage } from '@/types/chat';
import type {
  VoiceOutputHandle,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

const mockShowToast = jest.fn();
jest.mock('@/src/shared/components/Toast', () => ({
  ...jest.requireActual('@/src/shared/components/Toast'),
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

const mockInstalledVoices = jest.fn();
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: (...args: unknown[]) => mockInstalledVoices(...args),
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
}));

const voice = { identifier: 'v1', name: 'Voice', quality: 'Default', language: 'en-US' };

function answer(content = 'A finished answer.', citations?: ChatMessage['citations']): ChatMessage {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content,
    createdAt: '2026-11-15T00:00:00.000Z',
    ...(citations ? { citations } : {}),
  };
}

function owner(options: { current?: boolean; scope?: 'local' | 'cloud' } = {}): VoiceOutputOwner {
  const { current = true, scope = 'local' } = options;
  return {
    source:
      scope === 'local'
        ? { scope: 'local' }
        : { scope: 'cloud', account: { ownerId: 'o', epoch: 1 } },
    isCurrent: () => current,
    start: jest.fn((): VoiceOutputHandle => ({
      done: Promise.resolve({ status: 'done' }),
      stop: jest.fn().mockResolvedValue(undefined),
    })),
    stop: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  } as VoiceOutputOwner;
}

function show(
  speechOwner: VoiceOutputOwner | null | undefined,
  content?: string,
  citations?: ChatMessage['citations'],
) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <MessageBubble message={answer(content, citations)} speechOwner={speechOwner} />
    </SafeAreaProvider>,
  );
}

function readAloud() {
  return screen.getByRole('button', { name: 'Read aloud' });
}

describe('the Read aloud control under an answer', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
    mockShowToast.mockClear();
    mockInstalledVoices.mockReset();
    mockInstalledVoices.mockResolvedValue([voice]);
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('plays when the owner is current and a voice is installed', async () => {
    const speechOwner = owner();
    show(speechOwner);

    await waitFor(() => expect(mockInstalledVoices).toHaveBeenCalled());
    expect(readAloud().props.accessibilityHint).toBeUndefined();
    fireEvent.press(readAloud());

    expect(speechOwner.start).toHaveBeenCalledTimes(1);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('is dimmed and says the account changed when the owner is no longer current', () => {
    const speechOwner = owner({ current: false });
    show(speechOwner);

    expect(readAloud().props.accessibilityState).toEqual({ disabled: true });
    expect(readAloud().props.accessibilityHint).toBe(READ_ALOUD_UNAVAILABLE_REASON.accountChanged);
    fireEvent.press(readAloud());

    expect(mockShowToast).toHaveBeenLastCalledWith(READ_ALOUD_UNAVAILABLE_REASON.accountChanged);
    expect(speechOwner.start).not.toHaveBeenCalled();
  });

  it('says it is getting ready while the chat has no speech owner yet', () => {
    show(null);

    expect(readAloud().props.accessibilityHint).toBe(READ_ALOUD_UNAVAILABLE_REASON.preparing);
    fireEvent.press(readAloud());

    expect(mockShowToast).toHaveBeenLastCalledWith(READ_ALOUD_UNAVAILABLE_REASON.preparing);
  });

  it('is dimmed with the no voice reason when the device has no speech voice', async () => {
    mockInstalledVoices.mockResolvedValue([]);
    const speechOwner = owner();
    show(speechOwner);

    await waitFor(() =>
      expect(readAloud().props.accessibilityHint).toBe(READ_ALOUD_UNAVAILABLE_REASON.noVoice),
    );
    fireEvent.press(readAloud());

    expect(mockShowToast).toHaveBeenLastCalledWith(READ_ALOUD_UNAVAILABLE_REASON.noVoice);
    expect(speechOwner.start).not.toHaveBeenCalled();
  });

  it('keeps Read aloud available in AGI Cloud, where a server voice speaks', async () => {
    mockInstalledVoices.mockResolvedValue([]);
    const speechOwner = owner({ scope: 'cloud' });
    show(speechOwner);

    fireEvent.press(readAloud());

    expect(mockInstalledVoices).not.toHaveBeenCalled();
    expect(speechOwner.start).toHaveBeenCalledTimes(1);
  });

  it('does not probe for a voice on iOS, where speech plays with the default voice', () => {
    Platform.OS = 'ios';
    mockInstalledVoices.mockResolvedValue([]);
    const speechOwner = owner();
    show(speechOwner);

    expect(mockInstalledVoices).not.toHaveBeenCalled();
    expect(readAloud().props.accessibilityHint).toBeUndefined();
    fireEvent.press(readAloud());

    expect(speechOwner.start).toHaveBeenCalledTimes(1);
  });

  it('stays available when the voice list cannot be read', async () => {
    mockInstalledVoices.mockRejectedValue(new Error('engine unavailable'));
    const speechOwner = owner();
    show(speechOwner);

    await waitFor(() => expect(mockInstalledVoices).toHaveBeenCalled());
    fireEvent.press(readAloud());

    expect(speechOwner.start).toHaveBeenCalledTimes(1);
  });

  it('reads a cited answer without speaking its citation numbers', async () => {
    const speechOwner = owner();
    show(speechOwner, 'Rates held.[1] Inflation eased.[2][3]', [
      { url: 'https://rates.example/one', title: 'Rates' },
      { url: 'https://prices.example/two', title: 'Prices' },
      { url: 'https://wages.example/three', title: 'Wages' },
    ]);

    await waitFor(() => expect(mockInstalledVoices).toHaveBeenCalled());
    fireEvent.press(readAloud());

    expect(speechOwner.start).toHaveBeenCalledWith(
      'Rates held. Inflation eased.',
      expect.any(Object),
    );
  });

  it('reads bracketed numbers as written when the answer has no sources', async () => {
    const speechOwner = owner();
    show(speechOwner, 'The sum is x[1] + x[2].');

    await waitFor(() => expect(mockInstalledVoices).toHaveBeenCalled());
    fireEvent.press(readAloud());

    expect(speechOwner.start).toHaveBeenCalledWith('The sum is x[1] + x[2].', expect.any(Object));
  });
});
