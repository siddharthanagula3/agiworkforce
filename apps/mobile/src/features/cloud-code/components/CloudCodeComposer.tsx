import { TextInput, View } from 'react-native';
import { CLOUD_CODE_SESSION_COPY } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { SendButton } from '@/src/features/chat/components/SendButton';
import { radii, useThemeColors } from '@/src/ui/theme';

const SEND_LABEL = 'Send to this session';
const INPUT_LABEL = 'Message for this session';

export function CloudCodeComposer({
  value,
  working,
  stopping,
  modelName,
  onChangeText,
  onSend,
  onStop,
}: {
  value: string;
  working: boolean;
  stopping: boolean;
  modelName: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const colors = useThemeColors();
  const empty = value.trim().length === 0;

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
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
            fontSize: 16,
            lineHeight: 22,
            textAlignVertical: 'top',
          }}
        />
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
      <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, paddingLeft: 16 }}>
        {modelName}
      </Text>
    </View>
  );
}
