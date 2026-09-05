import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import type { ComposerVoiceState } from '../ChatInput';

function stubCanvasContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }) as unknown as CanvasGradient),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
}

const STATE_LABEL: Record<ComposerVoiceState, string> = {
  idle: 'Cloud voice',
  listening: 'Stop recording',
  transcribing: 'Transcribing voice',
  processing: 'Processing voice request',
  awaiting_action: 'Voice action awaiting approval',
  executing: 'Running voice action',
  stopping: 'Stopping voice action',
  error: 'Cloud voice',
  unsupported: 'Voice input unavailable',
};

function renderMic(state: ComposerVoiceState) {
  render(
    <ChatInput
      onSend={vi.fn()}
      onStop={vi.fn()}
      hasMessages={false}
      conversationId="conv-orb"
      voiceInputController={{ state, idleLabel: 'Cloud voice', onToggle: vi.fn() }}
    />,
  );
  return screen.getByRole('button', { name: STATE_LABEL[state] });
}

describe('ChatInput mic button, driven by the shared composer voice states', () => {
  beforeEach(() => {
    stubCanvasContext();
    useChatStore.setState({
      activeConversationId: 'conv-orb',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('paints the shared orb, listening, while the desktop composer records', () => {
    const button = renderMic('listening');
    const orb = button.querySelector('[data-testid="voice-orb-canvas"]');
    expect(orb?.getAttribute('data-orb-state')).toBe('listening');
  });

  it('paints the shared orb, thinking, across every desktop workflow state', () => {
    const thinking: ComposerVoiceState[] = [
      'transcribing',
      'processing',
      'awaiting_action',
      'executing',
      'stopping',
    ];
    for (const state of thinking) {
      const button = renderMic(state);
      const orb = button.querySelector('[data-testid="voice-orb-canvas"]');
      expect(orb?.getAttribute('data-orb-state')).toBe('thinking');
      cleanup();
    }
  });

  it('falls back to the plain mic glyph, no orb, once idle or unreachable', () => {
    for (const state of ['idle', 'error', 'unsupported'] as ComposerVoiceState[]) {
      const button = renderMic(state);
      expect(button.querySelector('[data-testid="voice-orb-canvas"]')).toBeNull();
      cleanup();
    }
  });
});
