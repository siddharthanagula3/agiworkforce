/**
 * SafeArtifactPreview — statically renders an UNTRUSTED, model-generated HTML or
 * SVG artifact inside a hardened WebView sandbox.
 *
 * SECURITY MODEL (why this is safe where a plain WebView is not):
 *   - `javaScriptEnabled={false}` — scripts in the artifact NEVER execute, so
 *     `<script>`/`onload`/`javascript:` XSS cannot run.
 *   - No `onMessage` / `injectedJavaScript` — the RN bridge
 *     (window.ReactNativeWebView) is not exposed, so untrusted content has
 *     nothing to call back into the host with.
 *   - A strict `Content-Security-Policy` (`default-src 'none'`) blocks ALL
 *     network egress (external img/css/font/fetch) — only `data:` images and
 *     inline styles are allowed, preventing data exfiltration.
 *   - `originWhitelist={[]}` + `onShouldStartLoadWithRequest` reject every
 *     navigation except the initial in-memory document, so a link/redirect
 *     cannot navigate the WebView anywhere.
 *
 * Only `html` and `svg` are rendered here. mermaid/jsx/tsx need JS or
 * compilation and are intentionally NOT rendered (the caller shows source).
 */
import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';
import { buildSandboxedArtifactHtml, type PreviewableKind } from './sandboxedArtifactHtml';

export type { PreviewableKind } from './sandboxedArtifactHtml';

export interface SafeArtifactPreviewProps {
  content: string;
  kind: PreviewableKind;
  style?: StyleProp<ViewStyle>;
}

export function SafeArtifactPreview({ content, kind, style }: SafeArtifactPreviewProps) {
  const html = useMemo(() => buildSandboxedArtifactHtml(content, kind), [content, kind]);

  return (
    <WebView
      source={{ html }}
      style={style}
      originWhitelist={[]}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      // Reject every navigation except the initial in-memory document.
      onShouldStartLoadWithRequest={(req) =>
        req.url === 'about:blank' || req.url === 'about:srcdoc' || req.url.startsWith('data:')
      }
      overScrollMode="never"
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
    />
  );
}
