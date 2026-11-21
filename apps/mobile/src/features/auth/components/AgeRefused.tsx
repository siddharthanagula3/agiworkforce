import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { ACCOUNT_AGE_REQUIREMENT_NOTICE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { openWebContentPage } from '@/src/platform/webContentPage';
import { useLocalDataExport } from '@/src/features/settings/data-controls/useLocalDataExport';
import { useEraseDeviceData } from '@/src/features/settings/data-controls/useEraseDeviceData';

export const ACCOUNT_DATA_RIGHTS_PATH = '/privacy/requests';

type AgeRefusedProps = {
  scope: 'device' | 'account';
  threshold: number;
  signedIn: boolean;
  onSignOut: () => void;
  onDeviceDataErased?: () => void;
  onContinueLocal?: () => void;
};

function refusalNotice(threshold: number): string {
  return threshold === ACCOUNT_MINIMUM_AGE
    ? ACCOUNT_AGE_REQUIREMENT_NOTICE
    : `AGI is for people ${threshold} and older in your region.`;
}

function TextAction({
  testID,
  label,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={styles.textAction}
    >
      <Text style={[styles.textActionLabel, { color: disabled ? colors.textMuted : colors.teal }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DeviceDataActions({ onErased }: { onErased: () => void }) {
  const { exporting, handleExport } = useLocalDataExport();
  const { isWiping, eraseDeviceData } = useEraseDeviceData(onErased);
  return (
    <>
      <TextAction
        testID="age-gate-refused-export"
        label={exporting ? 'Preparing export…' : 'Export this device’s data'}
        disabled={exporting || isWiping}
        onPress={() => void handleExport()}
      />
      <TextAction
        testID="age-gate-refused-erase"
        label={isWiping ? 'Erasing…' : 'Erase this device’s data'}
        disabled={exporting || isWiping}
        onPress={eraseDeviceData}
      />
    </>
  );
}

export function AgeRefused({
  scope,
  threshold,
  signedIn,
  onSignOut,
  onDeviceDataErased,
  onContinueLocal,
}: AgeRefusedProps) {
  const { colors, isDark } = useTheme();
  const primaryButtonTextColor = isDark ? colors.black : colors.white;

  return (
    <SafeAreaView testID="age-gate-refused" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.background }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSurface }]}>
          <Lock size={40} color={colors.teal} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          Age requirement
        </Text>

        <Text testID="age-gate-refusal" style={[styles.body, { color: colors.textSecondary }]}>
          {refusalNotice(threshold)}
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {scope === 'device'
            ? `This device recorded an age under ${threshold}. Only erasing AGI’s data on this device resets it.`
            : `This account gave an age under ${ACCOUNT_MINIMUM_AGE}, so AGI Cloud stays closed to it.`}
        </Text>

        {signedIn ? (
          <Pressable
            testID="age-gate-refused-sign-out-btn"
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
          >
            <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>Sign out</Text>
          </Pressable>
        ) : null}

        {scope === 'device' && onDeviceDataErased ? (
          <DeviceDataActions onErased={onDeviceDataErased} />
        ) : null}

        {signedIn ? (
          <TextAction
            testID="age-gate-refused-account-data"
            label="Account data and deletion"
            onPress={() => void openWebContentPage(ACCOUNT_DATA_RIGHTS_PATH)}
          />
        ) : null}

        {onContinueLocal ? (
          <TextAction
            testID="age-gate-refused-continue-local"
            label="Continue in Local Mode"
            onPress={onContinueLocal}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    ...contentColumn('form'),
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: typeScale.title1,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: typeScale.body,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  ctaBtn: {
    width: '100%',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  ctaBtnText: {
    fontWeight: '600',
    fontSize: typeScale.headline,
    lineHeight: 22,
  },
  textAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  textActionLabel: {
    fontSize: typeScale.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});
