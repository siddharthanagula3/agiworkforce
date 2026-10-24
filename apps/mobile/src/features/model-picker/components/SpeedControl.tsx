import { View } from 'react-native';
import { featureDefinition, featureMaturityLabel } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { Switch } from '@/components/ui/Switch';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { fastModeBlockMessage, useFastModeStore, useMobileFastMode } from '../fastMode';

const FAST_MODE_DEFINITION = featureDefinition('fast_mode');
const FAST_MODE_MATURITY = FAST_MODE_DEFINITION
  ? featureMaturityLabel(FAST_MODE_DEFINITION.maturity)
  : null;

export function SpeedControl({ modelId }: { modelId: string }) {
  const colors = useThemeColors();
  const fastMode = useMobileFastMode(modelId);
  const setEnabled = useFastModeStore((s) => s.setEnabled);
  if (!fastMode.offersFast) return null;

  const fastOn = fastMode.enabled && fastMode.allowed;
  const helper = fastMode.block
    ? fastModeBlockMessage(fastMode.block)
    : `Faster answers from the same model, at ${fastMode.priceMultiplier}x the usage, billed to usage credits.`;

  return (
    <View
      testID="model-picker-speed"
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '700' }}>
          Speed
        </Text>
        {FAST_MODE_MATURITY ? (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            {FAST_MODE_MATURITY}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            Fast
          </Text>
          <Text
            testID="model-picker-speed-helper"
            numberOfLines={2}
            style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}
          >
            {helper}
          </Text>
        </View>
        <Switch
          testID="model-picker-speed-switch"
          value={fastOn}
          disabled={!fastMode.allowed}
          onValueChange={setEnabled}
          accessibilityLabel="Fast mode"
          accessibilityHint={helper}
        />
      </View>
    </View>
  );
}
