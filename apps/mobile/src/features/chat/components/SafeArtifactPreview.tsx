import { useCallback, useMemo } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  parseMermaidPreviewMessage,
  type MermaidAppearance,
  type PreviewableKind,
} from './sandboxedArtifactHtml';

export type { PreviewableKind } from './sandboxedArtifactHtml';

import { MERMAID_CDN_ORIGIN, isAllowedPreviewNavigation } from './previewNavigationPolicy';

export interface SafeArtifactPreviewProps {
  content: string;
  kind: PreviewableKind;
  style?: StyleProp<ViewStyle>;
  appearance?: MermaidAppearance;
  scrollEnabled?: boolean;
  onDiagramRendered?: (height: number) => void;
  onDiagramFailed?: (reason: string) => void;
}

export function SafeArtifactPreview({
  content,
  kind,
  style,
  appearance,
  scrollEnabled,
  onDiagramRendered,
  onDiagramFailed,
}: SafeArtifactPreviewProps) {
  const isMermaid = kind === 'mermaid';
  const html = useMemo(
    () =>
      isMermaid
        ? buildMermaidPreviewHtml(content, appearance)
        : buildSandboxedArtifactHtml(content, kind === 'svg' ? 'svg' : 'html'),
    [content, kind, isMermaid, appearance],
  );
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

  return (
    <WebView
      source={{ html }}
      style={style}
      originWhitelist={isMermaid ? [`${MERMAID_CDN_ORIGIN}/*`] : []}
      javaScriptEnabled={isMermaid}
      domStorageEnabled={false}
      incognito={!isMermaid}
      cacheEnabled={isMermaid}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => isAllowedPreviewNavigation(req.url, isMermaid)}
      overScrollMode="never"
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
      scrollEnabled={scrollEnabled ?? true}
      onMessage={reportsDiagram ? handleMessage : undefined}
      onError={reportsDiagram ? handleLoadError : undefined}
    />
  );
}
