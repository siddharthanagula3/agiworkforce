import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useTheme, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SafeArtifactPreview } from './SafeArtifactPreview';

const PENDING_DIAGRAM_HEIGHT = 160;
const MAX_INLINE_DIAGRAM_HEIGHT = 520;

type DiagramOutcome = { phase: 'ready'; height: number } | { phase: 'failed'; reason: string };

interface MermaidDiagramBlockProps {
  source: string;
  colors: ColorScheme;
  sourceBlock: ReactNode;
}

export function MermaidDiagramBlock({ source, colors, sourceBlock }: MermaidDiagramBlockProps) {
  const { isDark } = useTheme();
  const [result, setResult] = useState<{ source: string; outcome: DiagramOutcome } | null>(null);
  const [showSource, setShowSource] = useState(false);
  const outcome = result?.source === source ? result.outcome : null;

  const appearance = useMemo(
    () => ({ background: colors.surfaceBase, dark: isDark }),
    [colors.surfaceBase, isDark],
  );
  const handleRendered = useCallback(
    (height: number) => setResult({ source, outcome: { phase: 'ready', height } }),
    [source],
  );
  const handleFailed = useCallback(
    (reason: string) => setResult({ source, outcome: { phase: 'failed', reason } }),
    [source],
  );

  if (outcome?.phase === 'failed') {
    return (
      <View style={{ marginVertical: 6, gap: 4 }}>
        <Text
          style={{ fontSize: typeScale.footnote, lineHeight: 19, color: colors.textSecondary }}
          accessibilityLiveRegion="polite"
        >
          {outcome.reason
            ? `This diagram could not be drawn: ${outcome.reason}. Its source is kept below.`
            : 'This diagram could not be drawn. Its source is kept below.'}
        </Text>
        {sourceBlock}
      </View>
    );
  }

  const drawnHeight = outcome?.phase === 'ready' ? outcome.height : null;

  return (
    <View
      style={{
        marginVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBase,
        overflow: 'hidden',
      }}
    >
      <SafeArtifactPreview
        content={source}
        kind="mermaid"
        appearance={appearance}
        style={{
          height: Math.min(drawnHeight ?? PENDING_DIAGRAM_HEIGHT, MAX_INLINE_DIAGRAM_HEIGHT),
          backgroundColor: colors.surfaceBase,
        }}
        scrollEnabled={drawnHeight !== null && drawnHeight > MAX_INLINE_DIAGRAM_HEIGHT}
        onDiagramRendered={handleRendered}
        onDiagramFailed={handleFailed}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingLeft: 12,
        }}
      >
        <Text
          style={{ fontSize: typeScale.caption, color: colors.textMuted, flexShrink: 1 }}
          accessibilityLiveRegion="polite"
        >
          {drawnHeight === null ? 'Drawing diagram…' : 'Diagram'}
        </Text>
        <PressableBox
          onPress={() => setShowSource((shown) => !shown)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showSource }}
          style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
          >
            {showSource ? 'Hide source' : 'Show source'}
          </Text>
        </PressableBox>
      </View>
      {showSource ? sourceBlock : null}
    </View>
  );
}
