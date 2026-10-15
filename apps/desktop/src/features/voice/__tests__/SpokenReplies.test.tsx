import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../../../api/voice');

const voiceApiMock = vi.hoisted(() => ({
  voiceTtsSpeakWithBargeIn: vi.fn(async () => undefined),
  voiceTtsSpeakLocal: vi.fn(async () => undefined),
  voiceTtsStop: vi.fn(async () => true),
}));

vi.mock('../../../api/voice', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  ...voiceApiMock,
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: true,
  isTauriContext: () => true,
  listen: vi.fn(async () => () => {}),
}));

import { useChatStore, type ChatMessage } from '@agiworkforce/unified-chat';
import type { VoiceCapabilities } from '../../../api/voice';
import { useVoiceModeStore } from '../../../stores/settings/voice';
import { useSpokenReplies } from '../SpokenReplies';
import { VOICE_PERSONA_STORAGE_KEY } from '../../settings/voicePersonaParams';

const CONVERSATION_ID = 'conv-spoken-replies';

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  constructor(text: string) {
    this.text = text;
  }
}

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: FakeUtterance,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
  value: FakeUtterance,
  writable: true,
  configurable: true,
});
Object.defineProperty(window, 'speechSynthesis', {
  value: { speak: vi.fn(), cancel: vi.fn() },
  writable: true,
  configurable: true,
});

function capabilities(overrides: Partial<VoiceCapabilities>): VoiceCapabilities {
  return {
    ttsAvailable: false,
    ttsProvider: 'System',
    ttsPlaying: false,
    wakeWordEnabled: false,
    wakeWordAvailable: false,
    bargeInEnabled: false,
    bargeInSensitivity: 0.5,
    vadAvailable: true,
    localSttAvailable: false,
    localSttModel: null,
    localTtsAvailable: false,
    localTtsVoice: null,
    systemDictationAvailable: false,
    ...overrides,
  };
}

function assistantMessage(id: string, content: string): ChatMessage {
  return { id, role: 'assistant', content, conversationId: CONVERSATION_ID };
}

function seedConversation(messages: ChatMessage[]): void {
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    messagesByConversation: { [CONVERSATION_ID]: messages },
    streamingConversationIds: {},
    isStreaming: false,
  });
}

function appendMessage(message: ChatMessage): void {
  const state = useChatStore.getState();
  const existing = state.messagesByConversation[CONVERSATION_ID] ?? [];
  useChatStore.setState({
    messagesByConversation: { [CONVERSATION_ID]: [...existing, message] },
  });
}

describe('useSpokenReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.speechSynthesis.speak = vi.fn();
    window.speechSynthesis.cancel = vi.fn();
    useVoiceModeStore.setState({
      speakRepliesEnabled: false,
      bargeInEnabled: false,
      capabilities: capabilities({ ttsAvailable: true }),
    });
    seedConversation([]);
  });

  it('speaks a finished assistant reply with the persisted persona params', async () => {
    localStorage.setItem(VOICE_PERSONA_STORAGE_KEY, 'energetic');
    useVoiceModeStore.setState({ speakRepliesEnabled: true });
    renderHook(() => useSpokenReplies());

    act(() => {
      appendMessage(assistantMessage('m1', '## Heading\n\nAll done.'));
    });

    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
    const utterance = vi.mocked(window.speechSynthesis.speak).mock
      .calls[0]![0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Heading\n\nAll done.');
    expect(utterance.rate).toBe(1.2);
    expect(utterance.pitch).toBe(1.2);
    expect(utterance.volume).toBe(1.0);
  });

  it('routes through native barge-in speech when barge-in is enabled', async () => {
    useVoiceModeStore.setState({ speakRepliesEnabled: true, bargeInEnabled: true });
    renderHook(() => useSpokenReplies());

    act(() => {
      appendMessage(assistantMessage('m1', 'Interrupt me.'));
    });

    await waitFor(() => {
      expect(voiceApiMock.voiceTtsSpeakWithBargeIn).toHaveBeenCalledWith('Interrupt me.');
    });
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('speaks through the local voice where the system voice is not implemented', async () => {
    localStorage.setItem(VOICE_PERSONA_STORAGE_KEY, 'calm');
    useVoiceModeStore.setState({
      speakRepliesEnabled: true,
      bargeInEnabled: true,
      capabilities: capabilities({ localTtsAvailable: true }),
    });
    renderHook(() => useSpokenReplies());

    act(() => {
      appendMessage(assistantMessage('m1', 'Local voice.'));
    });

    await waitFor(() => {
      expect(voiceApiMock.voiceTtsSpeakLocal).toHaveBeenCalledWith('Local voice.', 0.85, 0.9);
    });
    expect(voiceApiMock.voiceTtsSpeakWithBargeIn).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('never calls a native voice the platform cannot run', async () => {
    useVoiceModeStore.setState({
      speakRepliesEnabled: true,
      bargeInEnabled: true,
      capabilities: capabilities({}),
    });
    renderHook(() => useSpokenReplies());

    act(() => {
      appendMessage(assistantMessage('m1', 'Browser voice.'));
    });

    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
    expect(voiceApiMock.voiceTtsSpeakWithBargeIn).not.toHaveBeenCalled();
    expect(voiceApiMock.voiceTtsSpeakLocal).not.toHaveBeenCalled();
  });

  it('stays silent while the reply is still streaming', async () => {
    useVoiceModeStore.setState({ speakRepliesEnabled: true });
    renderHook(() => useSpokenReplies());

    act(() => {
      useChatStore.setState({ streamingConversationIds: { [CONVERSATION_ID]: true } });
      appendMessage({ ...assistantMessage('m1', 'partial'), isStreaming: true });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('does not speak when the setting is off, and does not replay it once turned on', async () => {
    const { rerender } = renderHook(() => useSpokenReplies());

    act(() => {
      appendMessage(assistantMessage('m1', 'Silent reply.'));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();

    act(() => {
      useVoiceModeStore.setState({ speakRepliesEnabled: true });
    });
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();

    act(() => {
      appendMessage(assistantMessage('m2', 'Spoken reply.'));
    });
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
  });

  it('does not replay history when switching to a conversation that already ends in a reply', async () => {
    useVoiceModeStore.setState({ speakRepliesEnabled: true });
    renderHook(() => useSpokenReplies());

    act(() => {
      useChatStore.setState({
        activeConversationId: 'other-conv',
        messagesByConversation: {
          'other-conv': [{ id: 'old', role: 'assistant', content: 'Old reply.' }],
        },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });
});
