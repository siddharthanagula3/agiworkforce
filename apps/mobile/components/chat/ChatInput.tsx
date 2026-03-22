import { useState, useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Plus, Link as LinkIcon } from 'lucide-react-native';
import { ModelSelectorButton } from './ModelSelectorButton';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { SendButton } from './SendButton';
import { CommandPalette } from './CommandPalette';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { RecordingOverlay } from '@/components/voice/RecordingOverlay';
import * as VoiceService from '@/services/voice';
import * as Haptics from 'expo-haptics';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import { getDisplayName } from '@/lib/models';
import { colors } from '@/lib/theme';
import { MAX_INPUT_LINES } from '@/lib/constants';
import type { VoiceMeteringEvent } from '@/services/voice';

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenAddToChat?: () => void;
  onOpenConnectors?: () => void;
  /** When true, input is grayed out and non-interactive (e.g. offline) */
  disabled?: boolean;
  /** Ref to imperatively add attachments from outside (e.g. AddToChatSheet pickers) */
  attachRef?: React.RefObject<{ addAttachments: (items: Attachment[]) => void } | null>;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
  onOpenAddToChat,
  onOpenConnectors,
  disabled,
  attachRef,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const { colors: themeColors, isDark } = useTheme();

  const modelName = getDisplayName(selectedModel);

  // Expose addAttachments to parent via ref so pickers can forward results
  useImperativeHandle(
    attachRef,
    () => ({
      addAttachments: (items: Attachment[]) => {
        setAttachments((prev) => [...prev, ...items]);
      },
    }),
    [],
  );

  // Clean up duration interval on unmount to prevent leak if user navigates away while recording
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
  }, [text, attachments, onSend, hapticsEnabled]);

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

  const showCommandPalette = text.startsWith('/') && !isStreaming;

  const handleSelectCommand = useCallback((command: string) => {
    setText(command + ' ');
    inputRef.current?.focus();
  }, []);

  const sendButtonState = isStreaming ? ('streaming' as const) : ('idle' as const);

  const handleSendButtonPress = useCallback(() => {
    if (isStreaming) {
      onStop?.();
    } else {
      handleSend();
    }
  }, [isStreaming, onStop, handleSend]);

  const handlePlusPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onOpenAddToChat?.();
  }, [hapticsEnabled, onOpenAddToChat]);

  const handleConnectorsPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onOpenConnectors?.();
  }, [hapticsEnabled, onOpenConnectors]);

  // Streaming placeholder text
  const placeholder = disabled
    ? "You're offline"
    : isStreaming
      ? `Reply to ${modelName}...`
      : 'Ask anything...';

  return (
    <View
      className="px-4 pb-4 pt-2"
      style={disabled ? { opacity: 0.5 } : undefined}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {/* Recording overlay -- shown while recording is active */}
      <RecordingOverlay
        visible={isRecording}
        audioLevel={audioLevel}
        durationMs={recordingDurationMs}
        onCancel={handleOverlayCancel}
        onSend={handleOverlaySend}
      />

      {/* Attachment preview strip */}
      <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />

      {/* Command palette -- shown when input starts with "/" */}
      <CommandPalette
        visible={showCommandPalette}
        query={text}
        onSelectCommand={handleSelectCommand}
      />

      <View
        style={{
          backgroundColor: themeColors.surfaceElevated,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        {/* Text input -- full width, top of the card */}
        <TextInput
          ref={inputRef}
          style={{
            color: themeColors.textPrimary,
            fontSize: 15,
            paddingVertical: 6,
            paddingHorizontal: 4,
            minHeight: 24,
            maxHeight: 120,
          }}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
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

        {/* Bottom toolbar row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          {/* Left group: [+] and [Model] */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {/* [+] Add to Chat button */}
            <Pressable
              onPress={handlePlusPress}
              style={{
                padding: 6,
                borderRadius: 8,
              }}
              accessibilityLabel="Add to chat"
              accessibilityHint="Opens attachment, mode, and feature options"
              accessibilityRole="button"
            >
              <Plus size={20} color={themeColors.textMuted} />
            </Pressable>

            {/* Model pill -- hidden during streaming to save space */}
            {!isStreaming && <ModelSelectorButton onPress={onOpenModelPicker ?? (() => {})} />}
          </View>

          {/* Right group: [connectors] [mic] [send/stop] */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {/* Connectors link -- hidden during streaming */}
            {!isStreaming && (
              <Pressable
                onPress={handleConnectorsPress}
                style={{
                  padding: 6,
                  borderRadius: 8,
                }}
                accessibilityLabel="Sources and connectors"
                accessibilityHint="Opens connectors page"
                accessibilityRole="button"
              >
                <LinkIcon size={18} color={themeColors.textMuted} />
              </Pressable>
            )}

            {/* Voice input button */}
            <VoiceInputButton
              onTranscription={handleTranscription}
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
              onMetering={handleMetering}
              onLongPress={onOpenVoiceMode}
              disabled={isStreaming}
            />

            {/* Send / Stop button */}
            <SendButton
              state={sendButtonState}
              onPress={handleSendButtonPress}
              disabled={!hasContent && !isStreaming}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
