/**
 * CloudTeaseModal — shown when a user who has already joined the waitlist
 * taps a cloud-locked feature.
 *
 * Reads the user's rank and shows a personalized "#N in line" message.
 * If rank is unknown (0 = first position) the modal still renders.
 *
 * Props:
 *   rank — 1-indexed position (pass the 0-indexed value + 1 from the server,
 *           or the raw 1-indexed value from your waitlist store)
 */
import { Modal, View, Pressable } from 'react-native';
import { Cloud } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/src/ui/theme';

export interface CloudTeaseModalProps {
  visible: boolean;
  /**
   * User's 1-indexed waitlist position (display rank).
   * Pass 0 if position is unknown — the number will be omitted from copy.
   */
  rank: number;
  onDismiss: () => void;
}

function formatRank(rank: number): string {
  return rank.toLocaleString('en-US');
}

export function CloudTeaseModal({ visible, rank, onDismiss }: CloudTeaseModalProps) {
  const colors = useThemeColors();

  // Build the full body text from atomic copy pieces
  const bodyText =
    rank > 0
      ? `${EDGE_COPY.cloudTease.bodyPrefix}${formatRank(rank)}${EDGE_COPY.cloudTease.bodyInfix}${EDGE_COPY.cloudTease.bodySuffix}`
      : `You're on the waitlist.${EDGE_COPY.cloudTease.bodySuffix}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing['2xl'],
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radii.xl,
            padding: spacing['2xl'],
            width: '100%',
            maxWidth: 340,
            alignItems: 'center',
            gap: spacing.lg,
          }}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — alertdialog valid role
          accessibilityRole="alertdialog"
          accessibilityLabel={EDGE_COPY.cloudTease.title}
        >
          {/* Icon */}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radii.full,
              backgroundColor: `${colors.teal}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cloud size={24} color={colors.teal} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {EDGE_COPY.cloudTease.title}
          </Text>

          {/* Rank + body */}
          <Text
            testID="cloud-tease-rank"
            style={{
              fontSize: 14,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {bodyText}
          </Text>

          {/* Dismiss */}
          <Pressable
            onPress={onDismiss}
            style={{
              width: '100%',
              backgroundColor: colors.teal,
              borderRadius: radii.lg,
              paddingVertical: spacing.md,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.cloudTease.cta}
          >
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.cloudTease.cta}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
