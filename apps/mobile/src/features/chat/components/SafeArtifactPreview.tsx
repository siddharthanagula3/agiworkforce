/**
 * SafeArtifactPreview — renders an UNTRUSTED, model-generated artifact inside a
 * hardened WebView sandbox.
 *
 * html/svg (SECURITY MODEL):
 *   - `javaScriptEnabled={false}` — scripts in the artifact NEVER execute.
 *   - No `onMessage`/`injectedJavaScript` — the RN bridge is not exposed.
 *   - Strict CSP `default-src 'none'` blocks ALL network egress.
 *   - `originWhitelist={[]}` + navigation rejected.
 *
 * mermaid (needs JS to render, so a tighter, still-bridge-less model):
 *   - JS enabled ONLY to run the trusted, PINNED mermaid library from one CDN
 *     (CSP `script-src` is limited to that origin); still NO RN bridge.
 *   - The untrusted diagram source is injected as a JSON data literal (never
 *     HTML/JS) and rendered with mermaid `securityLevel: 'strict'`.
 *   - Any escape is confined to the WebView (no bridge, no host access).
 */
import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  type PreviewableKind,
} from './sandboxedArtifactHtml';

export type { PreviewableKind } from './sandboxedArtifactHtml';

const MERMAID_CDN_PREFIX = 'https://cdn.jsdelivr.net';

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
      originWhitelist={isMermaid ? [MERMAID_CDN_PREFIX] : []}
      // mermaid needs JS to render; html/svg never execute scripts.
      javaScriptEnabled={isMermaid}
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      // Allow only the initial in-memory document (+ the pinned mermaid CDN for
      // mermaid); reject every other navigation.
      onShouldStartLoadWithRequest={(req) =>
        req.url === 'about:blank' ||
        req.url === 'about:srcdoc' ||
        req.url.startsWith('data:') ||
        (isMermaid && req.url.startsWith(MERMAID_CDN_PREFIX))
      }
      overScrollMode="never"
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
    />
  );
}
