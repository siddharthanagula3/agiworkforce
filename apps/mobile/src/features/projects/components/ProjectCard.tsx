import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, motion } from '@/src/ui/theme';
import { formatRelativeTime } from '@agiworkforce/utils/format';
import { projectAccentHex, projectIcon } from '@/src/features/projects/projectAppearance';
interface ProjectCardProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  iconId?: string | null;
  accentId?: string | null;
}

interface ProjectCardProps {
  project: ProjectCardProject;
  index: number;
  isActive: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
}

export function ProjectCard({ project, index, isActive, onPress, onLongPress }: ProjectCardProps) {
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();
  const Icon = projectIcon(project.iconId);
  const accent = projectAccentHex(project.accentId);
  return (
    <Animated.View
      entering={
        reducedMotion
          ? undefined
          : FadeInDown.duration(motion.moved)
              .delay(index * 60)
              .springify()
      }
    >
      <PressableBox
        onPress={() => onPress(project.id)}
        onLongPress={() => onLongPress(project.id)}
        className="rounded-xl overflow-hidden active:opacity-80"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: isActive ? colors.accentBorder : colors.border,
        }}
        accessibilityLabel={`Project: ${project.name}${isActive ? ', active' : ''}`}
        accessibilityRole="button"
        accessibilityHint="Tap to open, long press for options"
      >
        <View className="p-4 gap-2.5">
          {/* Top row: icon + name + active indicator */}
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{
                backgroundColor: accent
                  ? `${accent}22`
                  : isActive
                    ? colors.accentSurface
                    : colors.neutralSurface,
              }}
            >
              <Icon size={20} color={accent ?? (isActive ? colors.teal : colors.textMuted)} />
            </View>
            <View className="flex-1">
              <Text
                className="text-[15px] font-semibold"
                style={{ color: colors.textPrimary }}
                numberOfLines={1}
              >
                {project.name}
              </Text>
            </View>
            {isActive && (
              <View
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.accentSurface }}
              >
                <Check size={14} color={colors.teal} />
              </View>
            )}
          </View>

          {/* Description */}
          {project.description ? (
            <Text
              variant="caption"
              className="text-[13px] leading-[18px]"
              style={{ color: colors.textSecondary }}
              numberOfLines={2}
            >
              {project.description}
            </Text>
          ) : null}

          {/* Footer: last updated */}
          <View className="flex-row items-center justify-between pt-1">
            <Text variant="caption" className="text-xs" style={{ color: colors.textMuted }}>
              Updated {formatRelativeTime(project.updatedAt)}
            </Text>
          </View>
        </View>
      </PressableBox>
    </Animated.View>
  );
}
