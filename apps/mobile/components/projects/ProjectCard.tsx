import { View, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FolderOpen, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { formatRelativeTime } from '@agiworkforce/utils';
import type { Project } from '@/stores/projectStore';

interface ProjectCardProps {
  project: Project;
  index: number;
  isActive: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
}

export function ProjectCard({ project, index, isActive, onPress, onLongPress }: ProjectCardProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300)
        .delay(index * 60)
        .springify()}
    >
      <Pressable
        onPress={() => onPress(project.id)}
        onLongPress={() => onLongPress(project.id)}
        className="rounded-xl overflow-hidden active:opacity-80"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: isActive ? 1.5 : 0,
          borderColor: isActive ? colors.teal : 'transparent',
        }}
        accessibilityLabel={`Project: ${project.name}${isActive ? ', active' : ''}`}
        accessibilityRole="button"
        accessibilityHint="Tap to set active, long press for options"
      >
        <View className="p-4 gap-2.5">
          {/* Top row: icon + name + active indicator */}
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{
                backgroundColor: isActive ? `${colors.teal}20` : `${colors.textMuted}15`,
              }}
            >
              <FolderOpen size={20} color={isActive ? colors.teal : colors.textMuted} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-white" numberOfLines={1}>
                {project.name}
              </Text>
            </View>
            {isActive && (
              <View
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{ backgroundColor: `${colors.teal}25` }}
              >
                <Check size={14} color={colors.teal} />
              </View>
            )}
          </View>

          {/* Description */}
          {project.description ? (
            <Text
              variant="caption"
              className="text-white/50 text-[13px] leading-[18px]"
              numberOfLines={2}
            >
              {project.description}
            </Text>
          ) : null}

          {/* Footer: last updated */}
          <View className="flex-row items-center justify-between pt-1">
            <Text variant="caption" className="text-white/30 text-[11px]">
              Updated {formatRelativeTime(project.updatedAt)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
