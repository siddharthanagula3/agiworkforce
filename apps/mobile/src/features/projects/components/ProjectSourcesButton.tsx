import { useCallback, useState } from 'react';
import { Modal, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderOpen, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { ProjectSourcesTab } from './ProjectSourcesTab';

interface ProjectSourcesButtonProps {
  projectId: string | undefined;
}

export function ProjectSourcesButton({ projectId }: ProjectSourcesButtonProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const localName = useProjectStore(
    (s) => s.projects.find((project) => project.id === projectId)?.name,
  );
  const cloudName = useCloudProjectStore(
    (s) =>
      s.projects.find((project) => project.id === projectId && project.deletedAt === null)?.name,
  );
  const projectName = localName ?? cloudName;
  const close = useCallback(() => setOpen(false), []);

  if (!projectId || !projectName) return null;

  return (
    <>
      <PressableBox
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: radii.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
        })}
        accessibilityLabel="Open project sources"
        accessibilityRole="button"
      >
        <FolderOpen size={18} color={colors.textSecondary} />
      </PressableBox>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
          <View
            style={{
              minHeight: 52,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <PressableBox
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close project sources"
              hitSlop={8}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
            <View style={{ flex: 1 }}>
              <Text variant="subheading" style={{ color: colors.textPrimary }} numberOfLines={1}>
                {`${projectName} sources`}
              </Text>
              <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
                The files this project’s chats can read.
              </Text>
            </View>
          </View>
          <ProjectSourcesTab projectId={projectId} />
        </SafeAreaView>
      </Modal>
    </>
  );
}
