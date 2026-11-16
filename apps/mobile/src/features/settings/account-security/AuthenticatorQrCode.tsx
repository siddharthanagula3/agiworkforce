import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { create } from 'qrcode/lib/browser';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const QR_SIZE = 200;
const QUIET_ZONE_MODULES = 4;

export function encodeQrPath(text: string): { path: string; size: number } | null {
  try {
    const { modules } = create(text);
    const segments: string[] = [];
    for (let row = 0; row < modules.size; row += 1) {
      let col = 0;
      while (col < modules.size) {
        if (!modules.get(row, col)) {
          col += 1;
          continue;
        }
        const start = col;
        while (col < modules.size && modules.get(row, col)) col += 1;
        segments.push(
          `M${start + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h${col - start}v1h-${col - start}z`,
        );
      }
    }
    return { path: segments.join(''), size: modules.size + QUIET_ZONE_MODULES * 2 };
  } catch {
    return null;
  }
}

export function AuthenticatorQrCode({ value }: { value: string }) {
  const colors = useThemeColors();
  const code = useMemo(() => encodeQrPath(value), [value]);
  if (!code) return null;
  return (
    <View style={{ gap: 8 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="QR code for your authenticator app"
        style={{ alignSelf: 'center' }}
      >
        <Svg width={QR_SIZE} height={QR_SIZE} viewBox={`0 0 ${code.size} ${code.size}`}>
          <Rect width={code.size} height={code.size} fill={colors.white} />
          <Path d={code.path} fill={colors.black} />
        </Svg>
      </View>
      <Text
        style={{
          fontSize: typeScale.footnote,
          lineHeight: 19,
          color: colors.textSecondary,
          textAlign: 'center',
        }}
      >
        Scan with your authenticator app, or open it on this phone
      </Text>
      <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
        Or enter this key
      </Text>
    </View>
  );
}
