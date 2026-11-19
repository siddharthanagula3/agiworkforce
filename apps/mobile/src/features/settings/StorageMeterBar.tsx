import { View } from 'react-native';
import { useThemeColors } from '@/src/ui/theme';

const BAR_HEIGHT = 8;

export function storageMeterFraction(usedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, usedBytes / totalBytes));
}

export function StorageMeterBar({
  usedBytes,
  totalBytes,
  label,
  testID,
}: {
  usedBytes: number;
  totalBytes: number;
  label: string;
  testID: string;
}) {
  const colors = useThemeColors();
  const fraction = storageMeterFraction(usedBytes, totalBytes);
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={{
        height: BAR_HEIGHT,
        width: '100%',
        borderRadius: BAR_HEIGHT / 2,
        backgroundColor: colors.progressTrack,
        overflow: 'hidden',
      }}
    >
      <View
        testID={`${testID}-fill`}
        style={{
          height: BAR_HEIGHT,
          width: `${fraction * 100}%`,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: colors.teal,
        }}
      />
    </View>
  );
}
