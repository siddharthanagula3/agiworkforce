import { Modal, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { Archive, Copy, Pencil, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { CodeSession } from '../types';

interface CodeSessionMoreMenuProps {
  visible: boolean;
  session: CodeSession;
  onClose: () => void;
  onCopyBranch: () => void;
  onShare: () => void;
  onRename: () => void;
  onArchive: () => void;
}

export function CodeSessionMoreMenu({
  visible,
  session,
  onClose,
  onCopyBranch,
  onShare,
  onRename,
  onArchive,
}: CodeSessionMoreMenuProps) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.42)' }}
        onPress={onClose}
        accessibilityLabel="Close code session menu"
      >
        <View
          testID="code-more-menu"
          className="absolute right-4 w-[282px] rounded-[28px] border px-6 py-5"
          style={{
            top: insets.top + 56,
            backgroundColor: c.surfaceElevated,
            borderColor: c.border,
          }}
        >
          <MenuRow
            icon={<Copy size={26} color={c.textSecondary} />}
            title="Copy branch"
            subtitle={session.branch}
            onPress={onCopyBranch}
          />
          <MenuRow
            icon={<Share2 size={26} color={c.textSecondary} />}
            title="Share"
            onPress={onShare}
          />
          <MenuRow
            icon={<Pencil size={26} color={c.textSecondary} />}
            title="Rename"
            onPress={onRename}
          />
          <MenuRow
            icon={<Archive size={26} color={c.textSecondary} />}
            title="Archive"
            onPress={onArchive}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const c = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-5 py-3 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="w-8 items-center">{icon}</View>
      <View className="flex-1">
        <Text className="text-[22px]" style={{ color: c.textPrimary }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            className="text-[15px] leading-[19px] mt-0.5"
            style={{ color: c.textMuted }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
