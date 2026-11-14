import { useCallback, useRef } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { cleanupVoiceDictation } from '@agiworkforce/utils/voice';
import { SendButton } from '@/src/features/chat/components/SendButton';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { useCapability } from '@/src/lib/Capabilities';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const DICTATION_FAILED_TITLE = "Didn't catch that";
const DICTATION_FAILED_BODY = "Audio isn't saved, so say it again.";
const DICTATION_UNAVAILABLE_TITLE = 'Voice input unavailable';

export function SessionComposerField({
  value,
  placeholder,
  inputLabel,
  primaryState,
  primaryDisabled,
  primaryLabel,
  maxLength,
  onChangeText,
  onPrimary,
}: {
  value: string;
  placeholder: string;
  inputLabel: string;
  primaryState: 'idle' | 'streaming';
  primaryDisabled: boolean;
  primaryLabel: string;
  maxLength?: number;
  onChangeText: (text: string) => void;
  onPrimary: () => void;
}) {
  const colors = useThemeColors();
  const voiceAllowed = useCapability('canUseVoice');
  const latestValue = useRef(value);
  latestValue.current = value;

  const handleTranscription = useCallback(
    (transcript: string) => {
      const cleaned = cleanupVoiceDictation(transcript);
      if (!cleaned) {
        Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
        return;
      }
      const current = latestValue.current;
      const next = current.trim() ? `${current} ${cleaned}` : cleaned;
      latestValue.current = next;
      onChangeText(next);
    },
    [onChangeText],
  );

  const handleVoiceError = useCallback((message: string, permissionDenied?: boolean) => {
    if (permissionDenied) showVoicePermissionAlert(message);
    else Alert.alert(DICTATION_UNAVAILABLE_TITLE, message);
  }, []);

  const handleVoiceFailure = useCallback(() => {
    Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
  }, []);

  return (
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
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={maxLength}
        accessibilityLabel={inputLabel}
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
          state={primaryState}
          disabled={primaryDisabled}
          onPress={onPrimary}
          accessibilityLabel={primaryLabel}
        />
      </View>
    </View>
  );
}
