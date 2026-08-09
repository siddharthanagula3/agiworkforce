/**
 * MathBlock — renders a LaTeX expression using KaTeX inside a WebView.
 *
 * Supports:
 *   - display=false  (inline math, $...$)   — fixed 28px height row
 *   - display=true   (block math, $$...$$)  — auto-sizes via postMessage
 *
 * KaTeX is loaded from the official CDN. The WebView is sandboxed: no
 * navigation, no links, scrolling disabled. Content is fully self-contained
 * in the HTML string passed to the WebView.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Text } from '@/components/ui/text';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { agiPalette } from '@agiworkforce/design-tokens';
import { useThemeColors } from '@/src/ui/theme';
// `darkTokens` IS the dark palette (tokens.ts exports `colors` as
// mobileNativeColors.dark). Only `transparent` is read from it below, because
// that one value is byte-identical in both palettes and the module-scope
// StyleSheet cannot call useThemeColors(). Do NOT take surface/text/accent
// values from it here — they would bake dark values into light mode, and the
// AP-02 gate cannot catch that because a token reference is not a literal.
// Imported from the token module rather than the barrel: 38 mobile suites
// jest.mock('@/src/ui/theme') without a `colors` export, and a module-scope
// read of the barrel crashes them at import time.
import { colors as darkTokens } from '@/src/ui/theme/tokens';

// KaTeX CDN — pinned minor version for stability.
const KATEX_VERSION = '0.16.21';
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;

interface MathBlockProps {
  latex: string;
  /** true = $$...$$ display/block math; false = $...$ inline math */
  display: boolean;
}

/** Escapes a string for safe inclusion as HTML text content (not attributes). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds a self-contained HTML page that renders latex with KaTeX. */
function buildHtml(latex: string, display: boolean, isDark: boolean): string {
  const bg = isDark ? agiPalette.dark.surface.base : agiPalette.light.surface.base;
  const fg = isDark ? agiPalette.dark.text.primary : agiPalette.light.text.primary;
  const accentColor = isDark ? agiPalette.dark.accent.primary : agiPalette.light.accent.primary;

  // SECURITY: pass latex as HTML-escaped TEXT content, then read it back via
  // textContent — do NOT interpolate it into the inline <script>. JSON.stringify
  // does not neutralise a literal "</script>" sequence (the HTML parser ends the
  // script element regardless of JS string context), so chat-supplied LaTeX
  // could inject arbitrary markup/script into this WebView.
  const latexEscaped = escapeHtml(latex);

  // postMessage height after render so the RN side can size the View.
  const postMessageScript = `
    try {
      var el = document.getElementById('math-root');
      var h = el ? el.scrollHeight : 0;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: h }));
    } catch(e) {
      console.warn('[MathBlock] Failed to post rendered height:', e);
    }
  `;

  const errorHtml = (msg: string) =>
    `<span style="color:${agiPalette.dark.state.danger};font-family:monospace;font-size:12px">${msg}</span>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<link rel="stylesheet" href="${KATEX_CSS}"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: ${bg};
    color: ${fg};
    font-size: 15px;
    overflow: hidden;
    width: 100%;
  }
  #math-root {
    padding: ${display ? '10px 12px' : '2px 4px'};
    display: ${display ? 'block' : 'inline-block'};
    width: ${display ? '100%' : 'auto'};
    text-align: ${display ? 'center' : 'left'};
    line-height: ${display ? '1.6' : '1'};
  }
  /* Override KaTeX default text colour so it inherits our fg */
  .katex { color: ${fg}; }
  /* Teal accent on display-block border */
  ${display ? `#math-root { border-left: 2px solid ${accentColor}; padding-left: 14px; }` : ''}
  .katex-error { color: ${agiPalette.dark.state.danger}; font-size: 12px; font-family: monospace; }
</style>
</head>
<body>
<div id="latex-src" style="display:none">${latexEscaped}</div>
<div id="math-root"></div>
<script src="${KATEX_JS}"></script>
<script>
(function() {
  var srcEl = document.getElementById('latex-src');
  var latex = srcEl ? srcEl.textContent : '';
  try {
    katex.render(latex, document.getElementById('math-root'), {
      displayMode: ${display ? 'true' : 'false'},
      throwOnError: false,
      strict: false,
      output: 'html'
    });
  } catch (e) {
    document.getElementById('math-root').innerHTML = ${JSON.stringify(errorHtml('Math error'))};
  }
  ${postMessageScript}
})();
</script>
</body>
</html>`;
}

/**
 * Renders a LaTeX expression using KaTeX in a WebView.
 *
 * For display (block) math the View auto-sizes to content height.
 * For inline math a fixed-height View is used because React Native does
 * not support inline WebViews in a text flow; the component renders as a
 * small block that visually reads as "between text segments".
 */
export function MathBlock({ latex, display }: MathBlockProps) {
  const colors = useThemeColors();
  const systemScheme = useColorScheme();
  const isDark = systemScheme !== 'light';
  const [height, setHeight] = useState<number>(display ? 60 : 32);
  const [webViewError, setWebViewError] = useState(false);
  const renderedRef = useRef(false);

  const html = buildHtml(latex, display, isDark);

  useEffect(() => {
    renderedRef.current = false;
    setWebViewError(false);
    setHeight(display ? 60 : 32);
  }, [latex, display, isDark]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type?: unknown; value?: unknown };
        if (data.type === 'height' && typeof data.value === 'number' && data.value > 0) {
          // Add small vertical padding to avoid clipping descenders.
          const padded = data.value + (display ? 20 : 8);
          if (!renderedRef.current || padded !== height) {
            renderedRef.current = true;
            setHeight(padded);
          }
        }
      } catch (error) {
        console.warn('[MathBlock] Ignored invalid WebView message:', error);
      }
    },
    [display, height],
  );

  if (!latex.trim()) return null;
  if (webViewError) return <MathFallback latex={latex} display={display} />;

  const onWebViewError = (error: unknown) => {
    console.warn('[MathBlock] WebView render failed:', error);
    setWebViewError(true);
  };

  if (display) {
    // Block math: full-width View with auto height, teal left border from CSS
    return (
      <View
        style={[
          styles.blockContainer,
          { height },
          { backgroundColor: isDark ? `${colors.teal}14` : `${colors.teal}0f` },
        ]}
        accessibilityLabel={`Math equation: ${latex}`}
        accessibilityRole="image"
      >
        <WebView
          source={{ html }}
          style={styles.webView}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onMessage={onMessage}
          onError={(event) => onWebViewError(event.nativeEvent)}
          onHttpError={(event) => onWebViewError(event.nativeEvent)}
          originWhitelist={['*']}
          // Disable navigation — this WebView only renders a static page
          onShouldStartLoadWithRequest={(req) =>
            req.url === 'about:blank' || req.url === 'about:srcdoc'
          }
          javaScriptEnabled
          domStorageEnabled={false}
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction
          bounces={false}
          overScrollMode="never"
        />
      </View>
    );
  }

  // Inline math: small fixed-height row that sits between text nodes.
  // We wrap in a View rather than injecting into a <Text> because WebView
  // cannot be a child of Text in React Native.
  return (
    <View
      style={[styles.inlineContainer, { height }]}
      accessibilityLabel={`Inline math: ${latex}`}
      accessibilityRole="image"
    >
      <WebView
        source={{ html }}
        style={styles.webView}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onMessage}
        onError={(event) => onWebViewError(event.nativeEvent)}
        onHttpError={(event) => onWebViewError(event.nativeEvent)}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(req) =>
          req.url === 'about:blank' || req.url === 'about:srcdoc'
        }
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        bounces={false}
        overScrollMode="never"
      />
    </View>
  );
}

/** Fallback plain-text render used while WebView loads or on error. */
export function MathFallback({ latex, display }: MathBlockProps) {
  const colors = useThemeColors();
  if (display) {
    return (
      <View
        style={[
          styles.fallbackBlock,
          { backgroundColor: `${colors.teal}14`, borderLeftColor: colors.teal },
        ]}
      >
        <Text style={styles.fallbackText} selectable>
          {latex}
        </Text>
      </View>
    );
  }
  return (
    <Text style={[styles.fallbackInline, { backgroundColor: `${colors.teal}14` }]} selectable>
      {` ${latex} `}
    </Text>
  );
}

const styles = StyleSheet.create({
  blockContainer: {
    width: '100%',
    borderRadius: 6,
    marginVertical: 6,
    overflow: 'hidden',
  },
  inlineContainer: {
    // Inline math blocks are small rows that sit between paragraph lines.
    // marginVertical creates breathing room without breaking text flow.
    marginVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    minWidth: 40,
  },
  webView: {
    flex: 1,
    backgroundColor: darkTokens.transparent,
  },
  // Accent-tinted colours are applied by the components below: the accent
  // differs per theme (#111111 light, #f4f4f4 dark), so a module-scope
  // StyleSheet can only ever bake in one of them.
  fallbackBlock: {
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
    borderLeftWidth: 2,
  },
  fallbackText: {
    fontFamily: 'Menlo',
    fontStyle: 'italic',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  fallbackInline: {
    fontFamily: 'Menlo',
    fontStyle: 'italic',
    fontSize: 13,
  },
});
