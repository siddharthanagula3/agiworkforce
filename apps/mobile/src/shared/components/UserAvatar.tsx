import { Image, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export interface UserAvatarProps {
  /** Circle diameter in points. Everything else scales from this. */
  size: number;
  /** Clerk's `user.imageUrl`. Null/undefined in Local mode or while loading. */
  uri?: string | null;
  /** Name the initial is derived from. Blank falls back to the person glyph. */
  initials?: string | null;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * The one avatar every signed-in surface draws.
 *
 * Settings and Profile each hand-rolled a letter tile and never read
 * `clerkUser.imageUrl`, while the Account screen did — so the same signed-in
 * user saw their photo on one screen and a grey letter on the other two.
 * Preferring the photo here makes all three agree, and the initials/glyph
 * fallback keeps Local mode (which has no account to own a photo) intact.
 */
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
          // Drawn under a remote image so the circle keeps its shape while the
          // photo is still loading rather than flashing the page background.
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
