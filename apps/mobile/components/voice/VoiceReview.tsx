/**
 * VoiceReview — transcription review step before sending to chat.
 *
 * Shows the transcribed text with edit capability, then Cancel or Confirm.
 * Also shows a PerformanceChip indicating the on-device STT inference details.
 */

import { useState, useCallback } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { X, Check, Mic } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { PerformanceChip } from '@/components/chat/PerformanceChip';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

interface VoiceReviewProps {
  /** Whether the review panel is visible */
  visible: boolean;
  /** The transcribed text to review */
  transcript: string;
  /** Called when user cancels — discards the transcription */
  onCancel: () => void;
  /** Called with the (possibly edited) text to send to chat */
  onConfirm: (text: string) => void;
  /** Re-record: discard this and go back to recording */
  onReRecord?: () => void;
  /** STT latency for PerformanceChip, in ms */
  latencyMs?: number;
}

export function VoiceReview({
  visible,
  transcript,
  onCancel,
  onConfirm,
  onReRecord,
  latencyMs,
}: VoiceReviewProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [editedText, setEditedText] = useState(transcript);

  // Sync when transcript changes (new recording)
  const handleTranscriptChange = useCallback((text: string) => {
    setEditedText(text);
  }, []);

  // Reset edited text when transcript prop changes
  if (editedText !== transcript && !editedText) {
    setEditedText(transcript);
  }

  const handleConfirm = useCallback(() => {
    if (!editedText.trim()) return;
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(editedText.trim());
  }, [editedText, hapticsEnabled, onConfirm]);

  const handleCancel = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCancel();
  }, [hapticsEnabled, onCancel]);

  const handleReRecord = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReRecord?.();
  }, [hapticsEnabled, onReRecord]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.container}
      accessible
      accessibilityLabel="Review your transcription before sending"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Review</Text>
        {latencyMs !== undefined && (
          <PerformanceChip model="on-device STT" tier="Tier 2" firstTokenLatencyMs={latencyMs} />
        )}
      </View>

      {/* Editable transcript */}
      <View style={styles.transcriptBox}>
        <TextInput
          value={editedText}
          onChangeText={handleTranscriptChange}
          style={styles.transcriptInput}
          multiline
          autoFocus
          selectionColor={colors.terraCotta}
          placeholder="Transcription will appear here..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          accessibilityLabel="Edit transcription"
          accessibilityHint="Edit the transcribed text before sending"
        />
      </View>

      {/* Action row */}
      <View style={styles.actions}>
        {/* Cancel */}
        <Pressable
          onPress={handleCancel}
          style={styles.cancelBtn}
          accessibilityLabel="Cancel and discard"
          accessibilityRole="button"
        >
          <X size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Re-record */}
        {onReRecord && (
          <Pressable
            onPress={handleReRecord}
            style={styles.reRecordBtn}
            accessibilityLabel="Re-record voice"
            accessibilityRole="button"
          >
            <Mic size={20} color={colors.terraCotta} />
          </Pressable>
        )}

        {/* Confirm */}
        <Pressable
          onPress={handleConfirm}
          style={[
            styles.confirmBtn,
            { backgroundColor: editedText.trim() ? colors.terraCotta : 'rgba(218,119,86,0.3)' },
          ]}
          disabled={!editedText.trim()}
          accessibilityLabel="Send transcription"
          accessibilityRole="button"
          accessibilityState={{ disabled: !editedText.trim() }}
        >
          <Check size={22} color={colors.white} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(12,12,16,0.97)',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  transcriptBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(218,119,86,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
  },
  transcriptInput: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reRecordBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(218,119,86,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
