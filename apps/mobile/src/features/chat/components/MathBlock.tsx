import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { renderMathMarkup } from '@agiworkforce/unified-chat/math-markup';
import { useTheme, useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { colors as darkTokens } from '@/src/ui/theme/tokens';

interface MathBlockProps {
  latex: string;
  display: boolean;
}

const MATH_DOCUMENT_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
const DISPLAY_PADDING = 20;
// React Native already seats an inline view about one paragraph descender below the
// baseline (RCTTextLayoutManager adds font.descender), so the formula moves down only by
// the part of its descent beyond that.
const PARAGRAPH_DESCENDER = 3;

interface MathSize {
  height: number;
  width: number | null;
  baselineOffset: number;
}

function initialSize(display: boolean): MathSize {
  return { height: display ? 60 : 32, width: null, baselineOffset: 0 };
}

export function readMathSize(data: string, display: boolean): MathSize | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch (error) {
    console.warn('[MathBlock] Ignored invalid WebView message:', error);
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  const { type, height, width, descent } = message as Record<string, unknown>;
  if (type !== 'size' || typeof height !== 'number' || !(height > 0)) return null;
  if (display) return { height: height + DISPLAY_PADDING, width: null, baselineOffset: 0 };
  return {
    height,
    width: typeof width === 'number' && width > 0 ? width : null,
    baselineOffset: typeof descent === 'number' ? Math.max(0, descent - PARAGRAPH_DESCENDER) : 0,
  };
}

export function buildMathDocument(markup: string, display: boolean, colors: ColorScheme): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="${MATH_DOCUMENT_POLICY}"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: transparent;
    color: ${colors.textPrimary};
    font-size: 15px;
    overflow: hidden;
    width: 100%;
  }
  #math-root {
    padding: ${display ? '10px 12px' : '6px 6px 2px 4px'};
    display: ${display ? 'block' : 'inline-block'};
    width: ${display ? '100%' : 'auto'};
    text-align: ${display ? 'center' : 'left'};
    line-height: ${display ? '1.6' : 'normal'};
  }
  #math-baseline { display: inline-block; width: 0; height: 0; }
  math { font-family: math, 'STIX Two Math', serif; }
  ${display ? `#math-root { border-left: 2px solid ${colors.teal}; padding-left: 14px; }` : ''}
</style>
</head>
<body>
<div id="math-root">${markup}${display ? '' : '<span id="math-baseline"></span>'}</div>
<script>
(function() {
  try {
    var el = document.getElementById('math-root');
    var box = el.getBoundingClientRect();
    var marker = document.getElementById('math-baseline');
    var descent = marker ? box.bottom - marker.getBoundingClientRect().bottom : 0;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'size',
      height: ${display ? 'el.scrollHeight' : 'Math.ceil(box.height)'},
      width: Math.ceil(box.width),
      descent: Math.max(0, Math.ceil(descent))
    }));
  } catch (e) {
    console.warn('[MathBlock] Failed to post rendered size:', e);
  }
})();
</script>
</body>
</html>`;
}

export function MathBlock({ latex, display }: MathBlockProps) {
  const { colors, isDark } = useTheme();
  const [size, setSize] = useState<MathSize>(() => initialSize(display));
  const [webViewError, setWebViewError] = useState(false);

  const math = useMemo(() => renderMathMarkup(latex, display), [latex, display]);
  const html = useMemo(
    () => (math.ok ? buildMathDocument(math.markup, display, colors) : ''),
    [math, display, colors],
  );

  useEffect(() => {
    setWebViewError(false);
    setSize(initialSize(display));
  }, [latex, display]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const measured = readMathSize(event.nativeEvent.data, display);
      if (!measured) return;
      setSize((current) =>
        current.height === measured.height &&
        current.width === measured.width &&
        current.baselineOffset === measured.baselineOffset
          ? current
          : measured,
      );
    },
    [display],
  );

  if (!latex.trim()) return null;
  if (!math.ok || webViewError) return <MathFallback latex={latex} display={display} />;

  const onWebViewError = (error: unknown) => {
    console.warn('[MathBlock] WebView render failed:', error);
    setWebViewError(true);
  };

  return (
    <View
      style={[
        display ? styles.blockContainer : styles.inlineContainer,
        { height: size.height },
        !display && size.width !== null ? { width: size.width } : null,
        !display && size.baselineOffset > 0
          ? { transform: [{ translateY: size.baselineOffset }] }
          : null,
        display ? { backgroundColor: isDark ? `${colors.teal}14` : `${colors.teal}0f` } : null,
      ]}
      accessibilityLabel={display ? `Math equation: ${latex}` : `Inline math: ${latex}`}
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
    fontSize: typeScale.subhead,
    textAlign: 'center',
    lineHeight: 22,
  },
  fallbackInline: {
    fontFamily: 'Menlo',
    fontStyle: 'italic',
    fontSize: typeScale.footnote,
  },
});
