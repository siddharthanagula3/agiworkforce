import { useState, useRef, useCallback } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Send, Square } from 'lucide-react-native';
import { AutoApproveToggle } from './AutoApproveToggle';
import { ModelSelectorButton } from './ModelSelectorButton';
import { AttachmentButton } from './AttachmentButton';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { RecordingOverlay } from '@/components/voice/RecordingOverlay';
import * as VoiceService from '@/services/voice';
import { colors } from '@/lib/theme';
import { MAX_INPUT_LINES } from '@/lib/constants';
import type { VoiceMeteringEvent } from '@/services/voice';

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
  };

  const handleAttach = useCallback((newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleTranscription = useCallback((transcribedText: string) => {
    setIsRecording(false);
    setRecordingDurationMs(0);
    setAudioLevel(0);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setText((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
    inputRef.current?.focus();
  }, []);

  const handleRecordingStart = useCallback(() => {
    setIsRecording(true);
    setRecordingDurationMs(0);
    recordingStartTimeRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setRecordingDurationMs(Date.now() - recordingStartTimeRef.current);
    }, 100);
  }, []);

  const handleRecordingStop = useCallback(() => {
    // Duration timer stays until transcription completes (handled in handleTranscription)
  }, []);

  const handleMetering = useCallback((event: VoiceMeteringEvent) => {
    const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
    setAudioLevel(normalized);
  }, []);

  const handleOverlayCancel = useCallback(() => {
    setIsRecording(false);
    setRecordingDurationMs(0);
    setAudioLevel(0);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (VoiceService.isRecording()) {
      VoiceService.cancelRecording().catch(() => {
        // ignore cleanup errors
      });
    }
  }, []);

  const handleOverlaySend = useCallback(async () => {
    setIsRecording(false);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (!VoiceService.isRecording()) return;
    try {
      const uri = await VoiceService.stopRecording();
      const result = await VoiceService.transcribe(uri);
      if (result.text.trim()) {
        setText((prev) => (prev ? `${prev} ${result.text.trim()}` : result.text.trim()));
        inputRef.current?.focus();
      }
    } catch {
      // ignore transcription errors from overlay send
    }
    setRecordingDurationMs(0);
    setAudioLevel(0);
  }, []);

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <View className="px-4 pb-4 pt-2">
      {/* Recording overlay — shown while recording is active */}
      <RecordingOverlay
        visible={isRecording}
        audioLevel={audioLevel}
        durationMs={recordingDurationMs}
        onCancel={handleOverlayCancel}
        onSend={handleOverlaySend}
      />

      {/* Attachment preview strip */}
      <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />

      <View className="flex-row items-end gap-2 bg-surface-elevated rounded-2xl border border-white/8 px-3 py-2">
        {/* Attachment button */}
        <AttachmentButton onAttach={handleAttach} disabled={isStreaming} />

        {/* Auto-approve shield */}
        <AutoApproveToggle />

        {/* Model selector */}
        <ModelSelectorButton onPress={onOpenModelPicker ?? (() => {})} />

        {/* Text input */}
        <TextInput
          ref={inputRef}
          className="flex-1 text-white text-[15px] py-1.5 min-h-[24px] max-h-[120px]"
          placeholder="Message..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={MAX_INPUT_LINES}
          selectionColor={colors.teal}
          returnKeyType="default"
          blurOnSubmit={false}
          accessible={true}
          accessibilityLabel="Message input"
          accessibilityHint="Type your message to the AI assistant"
        />

        {/* Unified voice button — tap to toggle (Whisper), hold for PTT (Deepgram), long-press for voice mode */}
        <VoiceInputButton
          onTranscription={handleTranscription}
          onRecordingStart={handleRecordingStart}
          onRecordingStop={handleRecordingStop}
          onMetering={handleMetering}
          onLongPress={onOpenVoiceMode}
          disabled={isStreaming}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <Pressable
            onPress={onStop}
            className="p-2 rounded-xl bg-red-500"
            accessible={true}
            accessibilityLabel="Stop generating"
            accessibilityRole="button"
          >
            <Square size={16} color="#fff" fill="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            className={`p-2 rounded-xl ${hasContent ? 'bg-terra-cotta-500' : 'bg-white/10'}`}
            disabled={!hasContent}
            accessible={true}
            accessibilityLabel="Send message"
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasContent }}
          >
            <Send size={16} color={hasContent ? '#fff' : colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
