import { useEffect, useRef } from 'react';
import { useChatStore, type ChatMessage } from '@agiworkforce/unified-chat';
import { voiceTtsStop } from '../../api/voice';
import { isTauri } from '../../lib/tauri-mock';
import {
  browserSpeechAvailable,
  speakInBrowser,
  speakNatively,
  stripMarkdownForSpeech,
} from '../../hooks/useTTS';
import { useVoiceModeStore } from '../../stores/settings/voice';

const NOTHING_SPOKEN = '';
const NO_MESSAGES: ChatMessage[] = [];

export async function speakAssistantReply(content: string, bargeInEnabled: boolean): Promise<void> {
  const clean = stripMarkdownForSpeech(content);
  if (!clean) return;
  if (bargeInEnabled || !browserSpeechAvailable()) {
    try {
      if (await speakNatively(clean)) return;
    } catch (err) {
      console.warn('[spokenReplies] native speech failed', err);
    }
  }
  await speakInBrowser(clean);
}

export function settledAssistantReply(messages: ChatMessage[]): ChatMessage | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  if (last.isStreaming || last.error) return null;
  if (!last.content.trim()) return null;
  return last;
}

function stopSpeaking(): void {
  if (browserSpeechAvailable()) window.speechSynthesis.cancel();
  if (!isTauri) return;
  voiceTtsStop().catch((err: unknown) => {
    console.warn('[spokenReplies] voiceTtsStop failed', err);
  });
}

export function useSpokenReplies(): void {
  const speakRepliesEnabled = useVoiceModeStore((s) => s.speakRepliesEnabled);
  const bargeInEnabled = useVoiceModeStore((s) => s.bargeInEnabled);
  const conversationId = useChatStore((s) => s.activeConversationId);
  const messages = useChatStore((s) =>
    s.activeConversationId
      ? (s.messagesByConversation[s.activeConversationId] ?? NO_MESSAGES)
      : NO_MESSAGES,
  );
  const streaming = useChatStore((s) =>
    s.activeConversationId ? Boolean(s.streamingConversationIds[s.activeConversationId]) : false,
  );
  const lastHandledIdRef = useRef<string>(NOTHING_SPOKEN);

  useEffect(() => {
    const state = useChatStore.getState();
    const history = conversationId
      ? (state.messagesByConversation[conversationId] ?? NO_MESSAGES)
      : NO_MESSAGES;
    lastHandledIdRef.current = settledAssistantReply(history)?.id ?? NOTHING_SPOKEN;
  }, [conversationId]);

  useEffect(() => {
    if (streaming) return;
    const reply = settledAssistantReply(messages);
    if (!reply) return;
    if (lastHandledIdRef.current === reply.id) return;
    lastHandledIdRef.current = reply.id;
    if (!speakRepliesEnabled) return;
    void speakAssistantReply(reply.content, bargeInEnabled);
  }, [messages, streaming, speakRepliesEnabled, bargeInEnabled]);

  useEffect(() => {
    if (!speakRepliesEnabled) return;
    return stopSpeaking;
  }, [speakRepliesEnabled]);
}

export function SpokenReplies(): null {
  useSpokenReplies();
  return null;
}
