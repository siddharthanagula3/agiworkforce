import { useCallback, useEffect, useMemo, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  parseArtifactPreviewError,
  parseMermaidPreviewMessage,
  type MermaidAppearance,
  type PreviewableKind,
} from './sandboxedArtifactHtml';

export type { PreviewableKind } from './sandboxedArtifactHtml';

import { isAllowedPreviewNavigation } from './previewNavigationPolicy';
import { loadMermaidRuntime } from './mermaidRuntime';

type MermaidRuntimeState = { runtime: string } | { failed: true } | null;

function useMermaidRuntime(enabled: boolean): MermaidRuntimeState {
  const [state, setState] = useState<MermaidRuntimeState>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadMermaidRuntime().then(
      (runtime) => {
        if (live) setState({ runtime });
      },
      () => {
        if (live) setState({ failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

export interface SafeArtifactPreviewProps {
  content: string;
  kind: PreviewableKind;
  style?: StyleProp<ViewStyle>;
  appearance?: MermaidAppearance;
  scrollEnabled?: boolean;
  onDiagramRendered?: (height: number) => void;
  onDiagramFailed?: (reason: string) => void;
  onViewSource?: () => void;
}

export function SafeArtifactPreview({
  content,
  kind,
  style,
  appearance,
  scrollEnabled,
  onDiagramRendered,
  onDiagramFailed,
  onViewSource,
}: SafeArtifactPreviewProps) {
  const colors = useThemeColors();
  const isMermaid = kind === 'mermaid';
  const runsScripts = kind === 'html';
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState({ content, kind });
  if (shown.content !== content || shown.kind !== kind) {
    setShown({ content, kind });
    setRuntimeError(null);
    setAttempt((value) => value + 1);
  }
  const mermaidRuntime = useMermaidRuntime(isMermaid);
  const html = useMemo(() => {
    if (!isMermaid) return buildSandboxedArtifactHtml(content, kind === 'svg' ? 'svg' : 'html');
    return mermaidRuntime && 'runtime' in mermaidRuntime
      ? buildMermaidPreviewHtml(content, mermaidRuntime.runtime, appearance)
      : null;
  }, [content, kind, isMermaid, appearance, mermaidRuntime]);
  const reportsDiagram = isMermaid && Boolean(onDiagramRendered || onDiagramFailed);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMermaidPreviewMessage(event.nativeEvent.data);
      if (message?.type === 'rendered') onDiagramRendered?.(message.height);
      else if (message?.type === 'failed') onDiagramFailed?.(message.reason);
    },
    [onDiagramRendered, onDiagramFailed],
  );
  const handleLoadError = useCallback(() => onDiagramFailed?.(''), [onDiagramFailed]);
  const runtimeFailed = Boolean(mermaidRuntime && 'failed' in mermaidRuntime);
  useEffect(() => {
    if (runtimeFailed) onDiagramFailed?.('');
  }, [runtimeFailed, onDiagramFailed]);
  const handleRuntimeMessage = useCallback((event: WebViewMessageEvent) => {
    const report = parseArtifactPreviewError(event.nativeEvent.data);
    if (report) setRuntimeError(report.message);
  }, []);

  if (runtimeError !== null) {
    return (
      <View
        style={[style, { padding: 16, gap: 12, justifyContent: 'center' }]}
        accessibilityRole="alert"
      >
        <Text style={{ color: colors.textPrimary }}>This preview stopped with an error.</Text>
        <Text variant="caption" style={{ color: colors.textMuted }} selectable>
          {runtimeError}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Retry"
            variant="secondary"
            size="sm"
            accessibilityLabel="Run the preview again"
            onPress={() => {
              setRuntimeError(null);
              setAttempt((value) => value + 1);
            }}
          />
          {onViewSource ? (
            <Button
              title="View source"
              variant="ghost"
              size="sm"
              accessibilityLabel="Show the artifact source"
              onPress={onViewSource}
            />
          ) : null}
        </View>
      </View>
    );
  }

  if (html === null) return <View style={style} />;

  return (
    <WebView
      key={attempt}
      source={{ html }}
      style={style}
      originWhitelist={['*']}
      javaScriptEnabled={isMermaid || runsScripts}
      domStorageEnabled={false}
      incognito={!isMermaid}
      cacheEnabled={isMermaid}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => isAllowedPreviewNavigation(req.url)}
      overScrollMode="never"
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
      scrollEnabled={scrollEnabled ?? true}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      onMessage={reportsDiagram ? handleMessage : runsScripts ? handleRuntimeMessage : undefined}
      onError={reportsDiagram ? handleLoadError : undefined}
    />
  );
}
