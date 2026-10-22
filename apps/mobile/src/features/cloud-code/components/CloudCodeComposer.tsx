import { useCallback, useMemo } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_SESSION_COPY } from '@agiworkforce/types';
import { cleanupVoiceDictation } from '@agiworkforce/utils/voice';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { SendButton } from '@/src/features/chat/components/SendButton';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { useCapability } from '@/src/lib/capabilities';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  cloudCodeChangeTotals,
  cloudCodeFileCountLabel,
  cloudCodeChangeCountsLabel,
} from '../presentation';
import { CloudCodeLineCountsText } from './CloudCodeChangesCard';

const DICTATION_FAILED_TITLE = "Didn't catch that";
const DICTATION_FAILED_BODY = "Audio isn't saved, so say it again.";
const DICTATION_UNAVAILABLE_TITLE = 'Voice input unavailable';
const SEND_LABEL = 'Send to this session';
const INPUT_LABEL = 'Message for this session';

export function CloudCodeComposer({
  value,
  working,
  stopping,
  detail,
  optionsLabel,
  onChangeText,
  onSend,
  onStop,
  onOpenOptions,
  changes,
  onOpenChanges,
}: {
  value: string;
  working: boolean;
  stopping: boolean;
  detail: string;
  optionsLabel: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpenOptions: () => void;
  changes?: CloudCodeChanges | null;
  onOpenChanges?: () => void;
}) {
  const colors = useThemeColors();
  const voiceAllowed = useCapability('canUseVoice');
  const empty = value.trim().length === 0;
  const totals = useMemo(
    () => (changes ? cloudCodeChangeTotals(changes.files, changes.diff) : null),
    [changes],
  );

  const handleTranscription = useCallback(
    (transcript: string) => {
      const cleaned = cleanupVoiceDictation(transcript);
      if (!cleaned) {
        Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
        return;
      }
      onChangeText(value.trim() ? `${value} ${cleaned}` : cleaned);
    },
    [onChangeText, value],
  );

  const handleVoiceError = useCallback((message: string, permissionDenied?: boolean) => {
    if (permissionDenied) showVoicePermissionAlert(message);
    else Alert.alert(DICTATION_UNAVAILABLE_TITLE, message);
  }, []);

  const handleVoiceFailure = useCallback(() => {
    Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
  }, []);

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
      {totals && totals.files > 0 && onOpenChanges ? (
        <Pressable
          onPress={onOpenChanges}
          testID="cloud-code-changes-pill"
          accessibilityRole="button"
          accessibilityLabel={`${cloudCodeFileCountLabel(totals.files)} changed. ${cloudCodeChangeCountsLabel(totals)}`}
          style={{
            minHeight: 36,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
            {cloudCodeFileCountLabel(totals.files)}
          </Text>
          <CloudCodeLineCountsText counts={totals} />
        </Pressable>
      ) : null}
      <View
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          borderRadius: radii['3xl'],
          borderWidth: 1,
          borderColor: colors.composerBorder,
          backgroundColor: colors.inputSurface,
          paddingLeft: 16,
          paddingRight: 10,
          paddingVertical: 8,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={
            working
              ? CLOUD_CODE_SESSION_COPY.runningPlaceholder
              : CLOUD_CODE_SESSION_COPY.composerPlaceholder
          }
          placeholderTextColor={colors.textMuted}
          multiline
          accessibilityLabel={INPUT_LABEL}
          style={{
            flex: 1,
            maxHeight: 140,
            paddingVertical: 6,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            lineHeight: 22,
            textAlignVertical: 'top',
          }}
        />
        {voiceAllowed ? (
          <View style={{ paddingBottom: 1 }}>
            <VoiceInputButton
              onTranscription={handleTranscription}
              onError={handleVoiceError}
              onFailure={handleVoiceFailure}
            />
          </View>
        ) : null}
        <View style={{ paddingBottom: 2 }}>
          <SendButton
            state={working ? 'streaming' : 'idle'}
            disabled={working ? stopping : empty}
            onPress={working ? onStop : onSend}
            accessibilityLabel={
              working
                ? stopping
                  ? CLOUD_CODE_SESSION_COPY.stoppingTurn
                  : CLOUD_CODE_SESSION_COPY.stopTurn
                : SEND_LABEL
            }
          />
        </View>
      </View>
      <Pressable
        onPress={onOpenOptions}
        accessibilityRole="button"
        accessibilityLabel={`${optionsLabel}. ${detail}`}
        style={{
          minHeight: 32,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 16,
          paddingRight: 8,
        }}
      >
        <SlidersHorizontal size={13} color={colors.textMuted} />
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {detail}
        </Text>
      </Pressable>
    </View>
  );
}
