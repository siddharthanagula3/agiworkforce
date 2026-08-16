import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  type PreviewableKind,
} from './sandboxedArtifactHtml';

export type { PreviewableKind } from './sandboxedArtifactHtml';

import { MERMAID_CDN_ORIGIN, isAllowedPreviewNavigation } from './previewNavigationPolicy';

export interface SafeArtifactPreviewProps {
  content: string;
  kind: PreviewableKind;
  style?: StyleProp<ViewStyle>;
}

export function SafeArtifactPreview({ content, kind, style }: SafeArtifactPreviewProps) {
  const isMermaid = kind === 'mermaid';
  const html = useMemo(
    () =>
      isMermaid
        ? buildMermaidPreviewHtml(content)
        : buildSandboxedArtifactHtml(content, kind === 'svg' ? 'svg' : 'html'),
    [content, kind, isMermaid],
  );

  return (
    <WebView
      source={{ html }}
      style={style}
      originWhitelist={isMermaid ? [`${MERMAID_CDN_ORIGIN}/*`] : []}
      javaScriptEnabled={isMermaid}
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => isAllowedPreviewNavigation(req.url, isMermaid)}
      overScrollMode="never"
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
    />
  );
}
