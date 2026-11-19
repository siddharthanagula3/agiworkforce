import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Maximize2 } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useTheme, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { DiagramFullScreen } from './DiagramFullScreen';
import { DiagramSourceControls } from './DiagramSourceControls';
import { diagramFailureText } from './MermaidDiagramView';
import { SafeArtifactPreview } from './SafeArtifactPreview';
import { SideScroller } from './SideScroller';
import type { MermaidDrawing } from './sandboxedArtifactHtml';

const PENDING_DIAGRAM_HEIGHT = 160;
const DRAWN_HEIGHT_CACHE_SIZE = 32;
const CONTROL_TARGET = 44;
const ICON_SIZE = 16;
const FRAME_BORDER = 1;

const drawnHeights = new Map<string, number>();

function heightKey(source: string, dark: boolean): string {
  return `${dark ? 'dark' : 'light'}\n${source}`;
}

export function cachedDiagramHeight(source: string, dark: boolean): number | null {
  return drawnHeights.get(heightKey(source, dark)) ?? null;
}

function rememberDiagramHeight(source: string, dark: boolean, height: number) {
  const key = heightKey(source, dark);
  drawnHeights.delete(key);
  drawnHeights.set(key, height);
  if (drawnHeights.size > DRAWN_HEIGHT_CACHE_SIZE) {
    const oldest = drawnHeights.keys().next().value;
    if (oldest !== undefined) drawnHeights.delete(oldest);
  }
}

type DiagramOutcome =
  { phase: 'ready'; height: number; width: number | null } | { phase: 'failed'; reason: string };

interface MermaidDiagramBlockProps {
  source: string;
  colors: ColorScheme;
  sourceBlock: ReactNode;
}

export function MermaidDiagramBlock({ source, colors, sourceBlock }: MermaidDiagramBlockProps) {
  const { isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [result, setResult] = useState<{ source: string; outcome: DiagramOutcome } | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const outcome = result?.source === source ? result.outcome : null;

  const appearance = useMemo(
    () => ({ background: colors.surfaceBase, dark: isDark, fontScale }),
    [colors.surfaceBase, isDark, fontScale],
  );
  const handleRendered = useCallback(
    (height: number, drawing: MermaidDrawing) => {
      rememberDiagramHeight(source, isDark, height);
      setResult({ source, outcome: { phase: 'ready', height, width: drawing.width } });
    },
    [source, isDark],
  );
  const handleFailed = useCallback(
    (reason: string) => setResult({ source, outcome: { phase: 'failed', reason } }),
    [source],
  );
  const handleFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width) - FRAME_BORDER * 2;
    setFrameWidth((current) => (current === measured ? current : measured));
  }, []);

  if (outcome?.phase === 'failed') {
    return (
      <View style={{ marginVertical: 6, gap: 4 }}>
        <Text
          style={{ fontSize: typeScale.footnote, lineHeight: 19, color: colors.textSecondary }}
          accessibilityLiveRegion="polite"
        >
          {`${diagramFailureText(outcome.reason)} Its source is kept below.`}
        </Text>
        {sourceBlock}
      </View>
    );
  }

  const drawnHeight = outcome?.phase === 'ready' ? outcome.height : null;
  const drawnWidth = outcome?.phase === 'ready' ? outcome.width : null;
  const widerThanFrame = drawnWidth !== null && frameWidth !== null && drawnWidth > frameWidth + 1;
  const cachedHeight = cachedDiagramHeight(source, isDark);
  const frameHeight = drawnHeight ?? cachedHeight ?? PENDING_DIAGRAM_HEIGHT;
  const target = {
    width: CONTROL_TARGET,
    height: CONTROL_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View
      onLayout={handleFrameLayout}
      style={{
        marginVertical: 6,
        borderRadius: 8,
        borderWidth: FRAME_BORDER,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBase,
        overflow: 'hidden',
      }}
    >
      <SideScroller
        testID="mermaid-diagram-scroll"
        scrollEnabled={widerThanFrame}
        showsHorizontalScrollIndicator={widerThanFrame}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <SafeArtifactPreview
          content={source}
          kind="mermaid"
          appearance={appearance}
          style={{
            height: frameHeight,
            ...(widerThanFrame && drawnWidth !== null ? { width: drawnWidth } : { flexGrow: 1 }),
            backgroundColor: colors.surfaceBase,
          }}
          scrollEnabled={false}
          onDiagramRendered={handleRendered}
          onDiagramFailed={handleFailed}
        />
      </SideScroller>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingLeft: 12,
        }}
      >
        <Text
          style={{ fontSize: typeScale.caption, color: colors.textMuted, flex: 1 }}
          accessibilityLiveRegion="polite"
        >
          {drawnHeight === null ? 'Drawing diagram…' : 'Diagram'}
        </Text>
        <DiagramSourceControls source={source} color={colors.textMuted} iconSize={ICON_SIZE} />
        <PressableBox
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel="Expand diagram"
          style={target}
        >
          <Maximize2 size={ICON_SIZE} color={colors.textMuted} />
        </PressableBox>
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
      <DiagramFullScreen visible={expanded} source={source} onClose={() => setExpanded(false)} />
    </View>
  );
}
