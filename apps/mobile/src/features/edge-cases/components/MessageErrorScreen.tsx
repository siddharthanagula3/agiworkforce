import { View, Pressable } from 'react-native';
import { CloudOff, HardDrive, PackageOpen, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, radii } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';

interface MessageErrorScreenProps {
  onRetry?: () => void;
  onDismiss?: () => void;
}

function ErrorScreen({
  Icon,
  title,
  body,
  retryLabel,
  cancelLabel,
  onRetry,
  onDismiss,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  retryLabel: string;
  cancelLabel: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing['2xl'],
        gap: spacing.lg,
      }}
      accessibilityRole="alert"
      accessibilityLabel={title}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radii.full,
          backgroundColor: `${colors.agentWarning}18`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={26} color={colors.agentWarning} strokeWidth={2} />
      </View>

      <Text
        style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}
      >
        {title}
      </Text>

      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
        {body}
      </Text>

      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={{
            backgroundColor: colors.teal,
            borderRadius: radii.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing['2xl'],
            alignItems: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
            {retryLabel}
          </Text>
        </Pressable>
      )}

      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          style={{ alignItems: 'center', paddingVertical: spacing.sm }}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{cancelLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ModelMissingError({ onRetry, onDismiss }: MessageErrorScreenProps) {
  return (
    <ErrorScreen
      Icon={PackageOpen}
      title={EDGE_COPY.modelMissing.title}
      body={EDGE_COPY.modelMissing.body}
      retryLabel={EDGE_COPY.modelMissing.retry}
      cancelLabel={EDGE_COPY.modelMissing.cancel}
      onRetry={onRetry}
      onDismiss={onDismiss}
    />
  );
}

export function DiskFullError({ onRetry, onDismiss }: MessageErrorScreenProps) {
  return (
    <ErrorScreen
      Icon={HardDrive}
      title={EDGE_COPY.diskFull.title}
      body={EDGE_COPY.diskFull.body}
      retryLabel={EDGE_COPY.diskFull.retry}
      cancelLabel={EDGE_COPY.diskFull.cancel}
      onRetry={onRetry}
      onDismiss={onDismiss}
    />
  );
}

export function NetworkError({ onRetry, onDismiss }: MessageErrorScreenProps) {
  return (
    <ErrorScreen
      Icon={CloudOff}
      title={EDGE_COPY.networkError.title}
      body={EDGE_COPY.networkError.body}
      retryLabel={EDGE_COPY.networkError.retry}
      cancelLabel={EDGE_COPY.networkError.cancel}
      onRetry={onRetry}
      onDismiss={onDismiss}
    />
  );
}
