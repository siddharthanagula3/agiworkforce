import { ScrollView, View } from 'react-native';
import type { FileDiff } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { typeScale } from '@/src/ui/theme/tokens';
import { translatePlural } from '@/src/i18n/plural';
import {
  diffLineAccessibilityLabel,
  diffLineText,
} from '@/src/features/settings/code/codeAppearance';
import {
  useCodeFontFamily,
  useShowDiffSigns,
} from '@/src/features/settings/code/useCodeAppearance';
import type { CloudCodeDiffLineKind } from '@/src/features/cloud-code/presentation';
import { SideScroller } from './SideScroller';

export const TOOL_MONOSPACE = codeFontFamily;

export const MAX_RENDERED_DIFF_LINES = 400;
const DIFF_BODY_MAX_HEIGHT = 240;

const DIFF_SIGNS = { add: '+', remove: '-', context: ' ', meta: ' ' } as const;
const DIFF_KINDS: Record<FileDiff['lines'][number]['type'], CloudCodeDiffLineKind> = {
  add: 'added',
  remove: 'removed',
  context: 'context',
  meta: 'meta',
};

export function ToolFileDiffBlock({ diff, testID }: { diff: FileDiff; testID?: string }) {
  const colors = useThemeColors();
  const fontFamily = useCodeFontFamily();
  const showSigns = useShowDiffSigns();
  const visible = diff.lines.slice(0, MAX_RENDERED_DIFF_LINES);
  const truncated = diff.lines.length - visible.length;
  const fill = (type: FileDiff['lines'][number]['type']) =>
    type === 'add' ? colors.diffAddedFill : type === 'remove' ? colors.diffRemovedFill : undefined;
  const ink = (type: FileDiff['lines'][number]['type']) =>
    type === 'add'
      ? colors.diffAddedText
      : type === 'remove'
        ? colors.diffRemovedText
        : type === 'meta'
          ? colors.textMuted
          : colors.textSecondary;

  return (
    <View
      testID={testID ?? 'tool-file-diff'}
      accessibilityLabel={`${diff.filePath ? `Changes to ${diff.filePath}` : 'Proposed change'}: ${diff.additions} added, ${diff.deletions} removed`}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderLight,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily,
            fontSize: typeScale.caption,
            color: colors.textSecondary,
          }}
        >
          {diff.filePath ?? 'diff'}
        </Text>
        <Text
          style={{
            fontFamily,
            fontSize: typeScale.caption,
            color: colors.diffAddedText,
          }}
        >
          +{diff.additions}
        </Text>
        <Text
          style={{
            fontFamily,
            fontSize: typeScale.caption,
            color: colors.diffRemovedText,
          }}
        >
          -{diff.deletions}
        </Text>
      </View>
      <ScrollView
        nestedScrollEnabled
        style={{ maxHeight: DIFF_BODY_MAX_HEIGHT }}
        contentContainerStyle={{ paddingVertical: 2 }}
      >
        <SideScroller nestedScrollEnabled showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: '100%' }}>
            {visible.map((line, index) => (
              <View
                key={index}
                testID={`tool-file-diff-line-${line.type}`}
                accessible
                accessibilityLabel={
                  diffLineAccessibilityLabel(
                    `${DIFF_SIGNS[line.type]}${line.content}`,
                    DIFF_KINDS[line.type],
                  ) ??
                  (line.content || undefined)
                }
                style={{ flexDirection: 'row', backgroundColor: fill(line.type) }}
              >
                <Text
                  accessible={false}
                  style={{
                    width: 16,
                    textAlign: 'center',
                    fontFamily,
                    fontSize: typeScale.caption,
                    color: ink(line.type),
                  }}
                >
                  {diffLineText(DIFF_SIGNS[line.type], DIFF_KINDS[line.type], showSigns)}
                </Text>
                <Text
                  style={{
                    paddingRight: 8,
                    fontFamily,
                    fontSize: typeScale.caption,
                    color: ink(line.type),
                  }}
                >
                  {line.content || ' '}
                </Text>
              </View>
            ))}
            {truncated > 0 ? (
              <Text
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  fontSize: typeScale.caption,
                  color: colors.textMuted,
                }}
              >
                {translatePlural(
                  'chat',
                  'counts.hiddenLines',
                  truncated,
                  {
                    one: '{{lines}} more line not shown',
                    other: '{{lines}} more lines not shown',
                  },
                  { lines: truncated },
                )}
              </Text>
            ) : null}
          </View>
        </SideScroller>
      </ScrollView>
    </View>
  );
}
