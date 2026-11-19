import { useState } from 'react';
import { Image, View } from 'react-native';
import { useRecyclingState } from '@shopify/flash-list';
import {
  safeExecutionImageSrc,
  type CodeExecutionResult,
} from '@agiworkforce/unified-chat/code-execution-result';
import { CheckCircle2, ChevronDown, ChevronRight, Code2, XCircle } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { ShimmerText } from '@/components/ui/ShimmerText';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { TOOL_MONOSPACE } from './ToolFileDiffBlock';
import { ToolDetailActions } from './ToolDetailActions';
import {
  CodeExecutionPlotImage,
  plotHeading,
  type CodeExecutionPlotFile,
} from './CodeExecutionPlots';

export const CODE_EXECUTION_TITLE = 'Code Execution';
export const CODE_EXECUTION_RUNNING_LABEL = 'Running Python…';

const HEADING_ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
} as const;

const DEFAULT_PLOT_ASPECT_RATIO = 4 / 3;

function CodeExecutionPlot({ src, index }: { src: string; index: number }) {
  const colors = useThemeColors();
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_PLOT_ASPECT_RATIO);
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textMuted, fontSize: typeScale.caption, marginBottom: 4 }}
      >
        {plotHeading(index)}
      </Text>
      <Image
        source={{ uri: src }}
        accessibilityLabel={`Code execution output ${index + 1}`}
        resizeMode="contain"
        onLoad={(event) => {
          const { width, height } = event.nativeEvent.source;
          if (width > 0 && height > 0) setAspectRatio(width / height);
        }}
        style={{ width: '100%', aspectRatio, borderRadius: 6 }}
      />
    </View>
  );
}

interface CodeExecutionBlockProps {
  messageId: string;
  isExecuting?: boolean;
  result?: CodeExecutionResult;
  plots?: readonly CodeExecutionPlotFile[];
}

export function CodeExecutionBlock({
  messageId,
  isExecuting,
  result,
  plots = [],
}: CodeExecutionBlockProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useRecyclingState(true, [messageId]);
  if (!isExecuting && !result) return null;

  const plotSources =
    result?.images?.flatMap((image) => {
      const src = safeExecutionImageSrc(image);
      return src ? [src] : [];
    }) ?? [];
  const hasOutput = Boolean(
    result && (result.stdout || result.stderr || plotSources.length > 0 || plots.length > 0),
  );
  const failed = result !== undefined && result.returnCode !== 0;
  const statusLabel = isExecuting
    ? CODE_EXECUTION_RUNNING_LABEL
    : failed
      ? `Exit code ${result.returnCode}`
      : 'Finished';
  const StatusIcon = failed ? XCircle : CheckCircle2;

  return (
    <View
      testID="code-execution"
      style={{ marginVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceBase }}
    >
      <PressableBox
        onPress={hasOutput ? () => setExpanded((open) => !open) : undefined}
        disabled={!hasOutput}
        accessibilityRole={hasOutput ? 'button' : undefined}
        accessibilityLabel={`${CODE_EXECUTION_TITLE}, ${statusLabel}`}
        accessibilityState={hasOutput ? { expanded } : undefined}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 10,
          }}
        >
          <Code2 size={16} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {CODE_EXECUTION_TITLE}
          </Text>
          {result && !isExecuting ? (
            <StatusIcon size={14} color={failed ? colors.agentError : colors.agentSuccess} />
          ) : null}
          {hasOutput ? (
            expanded ? (
              <ChevronDown size={14} color={colors.textMuted} />
            ) : (
              <ChevronRight size={14} color={colors.textMuted} />
            )
          ) : null}
        </View>
      </PressableBox>

      {isExecuting ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          <ShimmerText
            testID="code-execution.running"
            text={CODE_EXECUTION_RUNNING_LABEL}
            baseColor={colors.textMuted}
            shineColor={colors.textPrimary}
            style={{ fontSize: typeScale.caption }}
          />
        </View>
      ) : null}

      {expanded && result && hasOutput ? (
        <View style={{ gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
          {result.stdout ? (
            <View testID="code-execution.output">
              <View style={HEADING_ROW}>
                <Text
                  accessibilityRole="header"
                  style={{ color: colors.textMuted, fontSize: typeScale.caption }}
                >
                  Output
                </Text>
                <ToolDetailActions
                  text={result.stdout}
                  part="output"
                  testID="code-execution.output-actions"
                />
              </View>
              <Text
                selectable
                style={{
                  color: colors.textSecondary,
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                }}
              >
                {result.stdout}
              </Text>
            </View>
          ) : null}
          {result.stderr ? (
            <View testID="code-execution.stderr">
              <View style={HEADING_ROW}>
                <Text
                  accessibilityRole="header"
                  style={{ color: colors.textMuted, fontSize: typeScale.caption }}
                >
                  Stderr
                </Text>
                <ToolDetailActions
                  text={result.stderr}
                  part="error"
                  testID="code-execution.stderr-actions"
                />
              </View>
              <Text
                selectable
                style={{
                  color: colors.agentError,
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                }}
              >
                {result.stderr}
              </Text>
            </View>
          ) : null}
          {plotSources.map((src, index) => (
            <CodeExecutionPlot key={index} src={src} index={index} />
          ))}
          {plots.map((plot, index) => (
            <CodeExecutionPlotImage
              key={plot.artifactId}
              plot={plot}
              index={plotSources.length + index}
            />
          ))}
          {failed ? (
            <Text
              testID="code-execution.exit-code"
              style={{ color: colors.agentError, fontSize: typeScale.caption }}
            >
              {`Exit code: ${result.returnCode}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
