import { useCallback } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Image as ImageIcon, PenLine, Search } from 'lucide-react-native';
import { getModelMetadataById } from '@agiworkforce/types';
import { isWebSearchAvailable } from '@agiworkforce/search';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useCapability } from '@/src/lib/capabilities';
import { useTierStore } from '@/src/features/billing/store';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { FEATURES } from '@/lib/v1FeatureFlags';

export type TaskChipType = 'write' | 'research';
export type TaskSuggestionType = 'image' | TaskChipType;

export const TASK_CHIP_DRAFT_STARTERS: Record<TaskSuggestionType, string> = {
  image: 'Create an image of ',
  write: 'Help me write ',
  research: 'Look up ',
};

export const TASK_CHIP_SEND_CONTEXT: Record<
  TaskChipType,
  { mode: 'create' | 'research'; taskInstruction: string; searchRequested?: true }
> = {
  write: {
    mode: 'create',
    taskInstruction:
      'Task: Write. Draft, edit, or structure writing with practical language and a polished final answer.',
  },
  research: {
    mode: 'research',
    searchRequested: true,
    taskInstruction:
      'Task: Research. Analyze carefully, separate facts from uncertainty, and avoid claiming live web access unless a web-search tool is available.',
  },
};

interface ChipDef {
  type: TaskSuggestionType;
  label: string;
  cloudOnly?: boolean;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

const CHIPS: ChipDef[] = [
  { type: 'image', label: 'Create an image', Icon: ImageIcon, cloudOnly: true },
  { type: 'write', label: 'Write or edit', Icon: PenLine },
  { type: 'research', label: 'Search the web', Icon: Search, cloudOnly: true },
];

interface TaskChipsProps {
  activeChip?: TaskChipType | null;
  onChipPress: (chip: TaskSuggestionType) => void;
  showCloudSuggestions: boolean;
  modelId?: string | null;
}

export function TaskChips({
  activeChip,
  onChipPress,
  showCloudSuggestions,
  modelId,
}: TaskChipsProps) {
  const colors = useThemeColors();
  const webSearchEnabled = useChatViewStore((state) => state.features.webSearch);
  const genericWebSearchAvailable = useTierStore((state) => state.genericWebSearchAvailable);
  const webSearchAllowed = useCapability('canUseWebSearch');
  const model = modelId ? getModelMetadataById(modelId) : null;
  const showWebSearchSuggestion =
    showCloudSuggestions &&
    FEATURES.webSearch &&
    webSearchEnabled &&
    webSearchAllowed &&
    isWebSearchAvailable({
      provider: model?.provider,
      modelSupportsNativeSearch: model?.capabilities.search,
      modelSupportsTools: model?.capabilities.tools,
      genericBackendConfigured: genericWebSearchAvailable,
    });

  const handlePress = useCallback(
    (type: TaskSuggestionType) => {
      onChipPress(type);
    },
    [onChipPress],
  );

  return (
    <View style={{ width: '100%', gap: 2 }}>
      {CHIPS.filter(
        (chip) =>
          (showCloudSuggestions || !chip.cloudOnly) &&
          (chip.type !== 'research' || showWebSearchSuggestion),
      ).map((chip) => {
        const active = activeChip === chip.type;
        const contentColor = active ? colors.teal : colors.textSecondary;
        return (
          <PressableBox
            key={chip.type}
            onPress={() => handlePress(chip.type)}
            accessibilityLabel={chip.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  paddingHorizontal: 8,
                  borderRadius: 10,
                  backgroundColor: active
                    ? colors.accentSurface
                    : pressed
                      ? colors.surfaceHover
                      : colors.transparent,
                }}
              >
                <chip.Icon size={17} color={contentColor} strokeWidth={1.75} />
                <Text
                  style={{
                    fontSize: typeScale.subhead,
                    color: contentColor,
                    fontWeight: active ? '500' : '400',
                  }}
                >
                  {chip.label}
                </Text>
              </View>
            )}
          </PressableBox>
        );
      })}
    </View>
  );
}
