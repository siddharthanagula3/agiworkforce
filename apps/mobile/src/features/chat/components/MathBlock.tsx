
import { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Text } from '@/components/ui/text';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { agiPalette } from '@agiworkforce/design-tokens';
import { useThemeColors } from '@/src/ui/theme';
import { colors as darkTokens } from '@/src/ui/theme/tokens';

const KATEX_VERSION = '0.16.21';
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;

interface MathBlockProps {
  latex: string;
  display: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(latex: string, display: boolean, isDark: boolean): string {
  const bg = isDark ? agiPalette.dark.surface.base : agiPalette.light.surface.base;
  const fg = isDark ? agiPalette.dark.text.primary : agiPalette.light.text.primary;
  const accentColor = isDark ? agiPalette.dark.accent.primary : agiPalette.light.accent.primary;

  const latexEscaped = escapeHtml(latex);

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
