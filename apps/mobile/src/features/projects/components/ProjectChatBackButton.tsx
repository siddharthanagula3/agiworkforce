import { ChevronLeft } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { radii, useThemeColors } from '@/src/ui/theme';

export const PROJECT_ORIGIN = 'project';

export function openedFromProject(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === PROJECT_ORIGIN;
}

interface ProjectChatBackButtonProps {
  projectName: string | undefined;
  onPress: () => void;
  testID?: string;
}

export function ProjectChatBackButton({
  projectName,
  onPress,
  testID,
}: ProjectChatBackButtonProps) {
  const colors = useThemeColors();
  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
      accessibilityLabel={projectName ? `Back to ${projectName}` : 'Back to project'}
      accessibilityRole="button"
    >
      <ChevronLeft size={22} color={colors.textSecondary} />
    </PressableBox>
  );
}
