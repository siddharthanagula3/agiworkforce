import { useState, useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { Alert, View, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Link as LinkIcon } from 'lucide-react-native';
import { ModelSelectorButton } from './ModelSelectorButton';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { SendButton } from './SendButton';
import { CommandPalette, type ChatCommand } from './CommandPalette';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { RecordingOverlay } from '@/src/features/voice/components/RecordingOverlay';
import * as VoiceService from '@/src/features/voice/services/voice';
import * as Haptics from 'expo-haptics';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/src/ui/theme';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { MAX_INPUT_LINES } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
import type { VoiceMeteringEvent } from '@/src/features/voice/services/voice';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils/voice';

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenCompare?: () => void;
  onOpenExport?: () => void;
  onOpenAddToChat?: () => void;
  onOpenConnectors?: () => void;
  /** When false, send button shows queued state and placeholder reflects offline status */
  isOnline?: boolean;
  /** Number of messages currently waiting in the offline queue */
  queueSize?: number;
  /** Ref to imperatively add attachments from outside (e.g. AddToChatSheet pickers) */
  attachRef?: React.RefObject<{ addAttachments: (items: Attachment[]) => void } | null>;
  /**
   * Per-file privacy label rendered as a chip on attachment thumbnails.
   * Sourced from the host's SendPreviewPresentation. PLAN.md section 5:
   * "Add per-file privacy labels".
   */
  attachmentPrivacyShortLabel?: string;
  /** When true, composer placeholder reads "Reply to AGI" instead of "Ask anything..." */
  isThreadActive?: boolean;
  /**
   * Pre-fill text for the composer on first render (e.g. from a conversation
   * starter or URL prompt param). Only applied once — subsequent changes to
   * this prop are ignored after mount.
   */
  initialText?: string;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
  onOpenCompare,
  onOpenExport,
  onOpenAddToChat,
  onOpenConnectors,
  isOnline = true,
  queueSize = 0,
  attachRef,
  attachmentPrivacyShortLabel,
  isThreadActive = false,
  initialText,
}: ChatInputProps) {
  const [text, setText] = useState(initialText ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  const modelName = getShortDisplayName(selectedModel);

  const applyTranscript = useCallback((transcript: string) => {
    const cleanedTranscript = cleanupVoiceDictation(transcript);
    if (!cleanedTranscript) {
      return;
    }

    const isCommand = detectVoiceCommand(cleanedTranscript);
    setText((prev) => {
      if (isCommand) {
        return cleanedTranscript;
      }

      return prev ? `${prev} ${cleanedTranscript}` : cleanedTranscript;
    });
    inputRef.current?.focus();
  }, []);

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

  const handleTranscription = useCallback(
    (transcribedText: string) => {
      setIsRecording(false);
      setRecordingDurationMs(0);
      setAudioLevel(0);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      applyTranscript(transcribedText);
    },
    [applyTranscript],
  );

  const resetRecordingUi = useCallback(() => {
    setIsRecording(false);
    setRecordingDurationMs(0);
    setAudioLevel(0);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
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
    resetRecordingUi();
  }, [resetRecordingUi]);

  const handleMetering = useCallback((event: VoiceMeteringEvent) => {
    const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
    setAudioLevel(normalized);
  }, []);

  const handleOverlayCancel = useCallback(() => {
    resetRecordingUi();
    setVoiceResetSignal((value) => value + 1);
    if (VoiceService.isRecording()) {
      VoiceService.cancelRecording().catch(() => {
        // ignore cleanup errors
      });
    }
  }, [resetRecordingUi]);

  const handleOverlaySend = useCallback(async () => {
    resetRecordingUi();
    if (!VoiceService.isRecording()) return;
    try {
      const uri = await VoiceService.stopRecording();
      const result = await VoiceService.transcribe(uri);
      if (result.text.trim()) {
        applyTranscript(result.text.trim());
      }
    } catch {
      // ignore transcription errors from overlay send
    } finally {
      setVoiceResetSignal((value) => value + 1);
    }
  }, [applyTranscript, resetRecordingUi]);

  const handleVoiceError = useCallback(
    (message: string) => {
      resetRecordingUi();
      setVoiceResetSignal((value) => value + 1);
      Alert.alert('Voice input unavailable', message);
    },
    [resetRecordingUi],
  );

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  const showCommandPalette = text.startsWith('/') && !isStreaming;

  const availableCommands: ChatCommand[] = [
    ...(FEATURES.imageGen ? (['/image'] as const) : []),
    ...(onOpenVoiceMode ? (['/voice'] as const) : []),
    ...(onOpenCompare ? (['/compare'] as const) : []),
    ...(onOpenExport ? (['/export'] as const) : []),
  ];

  const handleSelectCommand = useCallback(
    (command: ChatCommand) => {
      if (command === '/image') {
        setText('/image ');
        inputRef.current?.focus();
        return;
      }
      setText('');
      if (command === '/voice') onOpenVoiceMode?.();
      if (command === '/compare') onOpenCompare?.();
      if (command === '/export') onOpenExport?.();
    },
    [onOpenCompare, onOpenExport, onOpenVoiceMode],
  );

  const sendButtonState = isStreaming
    ? ('streaming' as const)
    : !isOnline && hasContent
      ? ('queued' as const)
      : ('idle' as const);

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
    if (!onOpenConnectors) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onOpenConnectors();
  }, [hapticsEnabled, onOpenConnectors]);

  const queueLabel = queueSize > 0 ? ` (${queueSize} queued)` : '';
  const placeholder = isStreaming
    ? `Reply to ${modelName}...`
    : !isOnline
      ? `Offline — message will send on reconnect${queueLabel}`
      : isThreadActive
        ? 'Reply to AGI'
        : "What's on your mind?";

  return (
    <View className="px-4 pt-2" style={{ paddingBottom: Math.max(insets.bottom + 6, 16) }}>
      {/* Recording overlay -- shown while recording is active */}
      <RecordingOverlay
        visible={isRecording}
        audioLevel={audioLevel}
        durationMs={recordingDurationMs}
        onCancel={handleOverlayCancel}
        onSend={handleOverlaySend}
      />

      {/* Attachment preview strip */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        privacyShortLabel={attachmentPrivacyShortLabel}
      />

      {/* Command palette -- shown when input starts with "/" */}
      <CommandPalette
        visible={showCommandPalette}
        query={text}
        availableCommands={availableCommands}
        onSelectCommand={handleSelectCommand}
      />

      <View
        style={{
          backgroundColor: themeColors.surfaceElevated,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: themeColors.composerBorder,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        {/* Text input -- full width, top of the card */}
        <TextInput
          ref={inputRef}
          testID="chat.composer.input"
          style={{
            color: themeColors.textPrimary,
            fontSize: 15,
            paddingVertical: 6,
            paddingHorizontal: 4,
            minHeight: 24,
            maxHeight: 200,
          }}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={MAX_INPUT_LINES}
          selectionColor={themeColors.teal}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 }}>
            {/* [+] Add to Chat button */}
            <Pressable
              onPress={handlePlusPress}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              hitSlop={6}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {/* Connectors link -- hidden unless the host has a real destination */}
            {!isStreaming && onOpenConnectors ? (
              <Pressable
                onPress={handleConnectorsPress}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                hitSlop={6}
                accessibilityLabel="Sources and connectors"
                accessibilityHint="Opens connectors page"
                accessibilityRole="button"
              >
                <LinkIcon size={18} color={themeColors.textMuted} />
              </Pressable>
            ) : null}

            {/* Voice input button */}
            <View testID="chat.composer.mic">
              <VoiceInputButton
                onTranscription={handleTranscription}
                onRecordingStart={handleRecordingStart}
                onRecordingStop={handleRecordingStop}
                onMetering={handleMetering}
                onLongPress={onOpenVoiceMode}
                onError={handleVoiceError}
                resetSignal={voiceResetSignal}
                disabled={isStreaming}
              />
            </View>

            {/* Send / Stop button */}
            <View testID="chat.composer.send">
              <SendButton
                state={sendButtonState}
                onPress={handleSendButtonPress}
                disabled={!hasContent && !isStreaming}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
