import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { TOOL_STATUS_PRESENTATION, bareMediaType, normalizeToolStatus } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, typeScale } from '@/src/ui/theme/tokens';
import {
  useGeneratedImageSource,
  type GeneratedImageSourceStatus,
} from '@/src/features/image/hooks/useGeneratedImageSource';
import { executedToolCode } from '@/src/features/chat/utils/executedToolCode';
import type { Artifact } from '@/types/chat';
import { ImageFullScreen } from './ImageFullScreen';
import { storedImagePath } from './artifact-viewers/viewerKind';

export interface CodeExecutionPlotFile {
  artifactId: string;
  path: string;
  name: string;
}

const PLOT_MEDIA_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg']);
const PLACEHOLDER_ASPECT_RATIO = 4 / 3;
export const PLOT_LOAD_FAILED = 'This image could not be loaded.';
export const PLOT_SIGN_IN = 'Sign in to view this generated image';

function unavailablePlotMessage(
  failed: boolean,
  status: GeneratedImageSourceStatus | null,
): { text: string; retry: boolean } | null {
  if (status === 'signed-out') return { text: PLOT_SIGN_IN, retry: false };
  if (status === 'invalid') return { text: PLOT_LOAD_FAILED, retry: false };
  if (failed || status === 'error') return { text: PLOT_LOAD_FAILED, retry: true };
  return null;
}

export function codeExecutionPlotFiles(artifacts: readonly Artifact[]): CodeExecutionPlotFile[] {
  return artifacts.flatMap((artifact) => {
    const file = artifact.generatedFile;
    if (!file?.uri || !PLOT_MEDIA_TYPES.has(bareMediaType(file.mimeType))) return [];
    const path = storedImagePath(file.uri);
    return path ? [{ artifactId: artifact.id, path, name: file.fileName || artifact.title }] : [];
  });
}

export function finishedCodeStepId(activity: AgentActivityState | undefined): string | undefined {
  if (!activity) return undefined;
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (
      entry?.kind === 'tool' &&
      TOOL_STATUS_PRESENTATION[normalizeToolStatus(entry.status)].terminal &&
      executedToolCode(entry.name, entry.input) !== undefined
    ) {
      return entry.id;
    }
  }
  return undefined;
}

export function plotHeading(index: number): string {
  return `Plot ${index + 1}`;
}

function StoredPlotImage({
  plot,
  heading,
  onRetry,
}: {
  plot: CodeExecutionPlotFile;
  heading: string;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const onDevice = plot.path.startsWith('file://');
  const stored = useGeneratedImageSource(onDevice ? '' : plot.path, false);
  const source = onDevice ? { uri: plot.path } : stored.source;
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(false);
  const unavailable = unavailablePlotMessage(failed, onDevice ? null : stored.status);

  if (unavailable) {
    return (
      <View
        testID="code-execution.plot-failed"
        style={{
          aspectRatio: PLACEHOLDER_ASPECT_RATIO,
          borderRadius: radii.md,
          backgroundColor: colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: 12,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textMuted, fontSize: typeScale.caption, textAlign: 'center' }}
        >
          {unavailable.text}
        </Text>
        {unavailable.retry ? (
          <PressableBox
            testID="code-execution.plot-retry"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${heading}`}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              Retry
            </Text>
          </PressableBox>
        ) : null}
      </View>
    );
  }

  const loaded = aspectRatio !== null;
  return (
    <>
      <PressableBox
        testID="code-execution.plot"
        onPress={loaded ? () => setViewing(true) : undefined}
        disabled={!loaded}
        accessibilityRole="imagebutton"
        accessibilityLabel={heading}
        accessibilityHint={loaded ? 'Opens the image full screen' : undefined}
        accessibilityState={{ busy: !loaded, disabled: !loaded }}
        style={{
          width: '100%',
          aspectRatio: aspectRatio ?? PLACEHOLDER_ASPECT_RATIO,
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: loaded ? colors.transparent : colors.surfaceElevated,
        }}
      >
        {source ? (
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={200}
            accessible={false}
            onLoad={(event) => {
              const { width, height } = event.source;
              setAspectRatio(width > 0 && height > 0 ? width / height : PLACEHOLDER_ASPECT_RATIO);
            }}
            onError={() => setFailed(true)}
          />
        ) : null}
      </PressableBox>
      <ImageFullScreen
        imageUrl={plot.path}
        kind="attachment"
        name={plot.name}
        visible={viewing}
        onClose={() => setViewing(false)}
      />
    </>
  );
}

export function CodeExecutionPlotImage({
  plot,
  index,
}: {
  plot: CodeExecutionPlotFile;
  index: number;
}) {
  const colors = useThemeColors();
  const [attempt, setAttempt] = useState(0);
  const heading = plotHeading(index);
  return (
    <View testID={`code-execution.plot-${plot.artifactId}`}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textMuted, fontSize: typeScale.caption, marginBottom: 4 }}
      >
        {heading}
      </Text>
      <StoredPlotImage
        key={attempt}
        plot={plot}
        heading={heading}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    </View>
  );
}
