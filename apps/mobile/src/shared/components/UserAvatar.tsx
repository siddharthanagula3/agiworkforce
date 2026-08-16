import { Image, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export interface UserAvatarProps {
  size: number;
  uri?: string | null;
  initials?: string | null;
  testID?: string;
  accessibilityLabel?: string;
}

export function UserAvatar({
  size,
  uri,
  initials,
  testID,
  accessibilityLabel = 'Profile picture',
}: UserAvatarProps) {
  const colors = useThemeColors();
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.surfaceHover,
        }}
      />
    );
  }

  const initial = (initials ?? '').trim().charAt(0).toUpperCase();

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.surfaceHover,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial ? (
        <Text
          style={{ color: colors.textPrimary, fontSize: Math.round(size * 0.4), fontWeight: '700' }}
        >
          {initial}
        </Text>
      ) : (
        <UserRound size={Math.round(size * 0.46)} color={colors.textMuted} />
      )}
    </View>
  );
}
