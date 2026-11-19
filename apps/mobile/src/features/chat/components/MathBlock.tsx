import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/Text';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { renderMathMarkup } from '@agiworkforce/unified-chat/math-markup';
import { useTheme, useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { chatTypography, spacing, typeScale } from '@/src/ui/theme/tokens';
import { colors as darkTokens } from '@/src/ui/theme/tokens';
import { speakMathMarkup } from '@/src/features/chat/utils/mathSpeech';
import { SideScroller } from './SideScroller';
import { katexStylesFor } from './mathKatexStyles';

interface MathBlockProps {
  latex: string;
  display: boolean;
  color?: string;
}

interface MathDocumentOptions {
  color?: string;
  fontSize?: number;
}

const MATH_DOCUMENT_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:";
const DISPLAY_PADDING = 20;
// React Native already seats an inline view about one paragraph descender below the
// baseline (RCTTextLayoutManager adds font.descender), so the formula moves down only by
// the part of its descent beyond that.
const PARAGRAPH_DESCENDER = 3;
const INLINE_GUTTER = spacing['2xl'] * 2;
const MEASURED_SIZE_CACHE_SIZE = 256;
const MAX_RECLAIM_RECOVERIES = 3;

interface MathSize {
  height: number;
  width: number | null;
  baselineOffset: number;
}

const measuredSizes = new Map<string, MathSize>();

function sizeKey(latex: string, display: boolean, fontSize: number): string {
  return `${display ? 'display' : 'inline'}:${fontSize}:${latex}`;
}

function rememberSize(key: string, size: MathSize) {
  measuredSizes.delete(key);
  measuredSizes.set(key, size);
  if (measuredSizes.size > MEASURED_SIZE_CACHE_SIZE) {
    const oldest = measuredSizes.keys().next().value;
    if (oldest !== undefined) measuredSizes.delete(oldest);
  }
}

function initialSize(display: boolean, key: string): MathSize {
  return measuredSizes.get(key) ?? { height: display ? 60 : 32, width: null, baselineOffset: 0 };
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
  const measuredWidth = typeof width === 'number' && width > 0 ? width : null;
  if (display) {
    return { height: height + DISPLAY_PADDING, width: measuredWidth, baselineOffset: 0 };
  }
  return {
    height,
    width: measuredWidth,
    baselineOffset: typeof descent === 'number' ? Math.max(0, descent - PARAGRAPH_DESCENDER) : 0,
  };
}

export function buildMathDocument(
  markup: string,
  display: boolean,
  colors: ColorScheme,
  options: MathDocumentOptions = {},
): string {
  const fontSize = options.fontSize ?? chatTypography.body.fontSize;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="${MATH_DOCUMENT_POLICY}"/>
<style>${katexStylesFor(markup)}</style>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: transparent;
    color: ${options.color ?? colors.textPrimary};
    font-size: ${fontSize}px;
    overflow: hidden;
    width: 100%;
  }
  #math-root {
    padding: ${display ? '10px 12px' : '6px 6px 2px 4px'};
    display: inline-block;
    width: ${display ? 'max-content' : 'auto'};
    min-width: ${display ? '100%' : '0'};
    white-space: nowrap;
    text-align: ${display ? 'center' : 'left'};
    line-height: ${display ? '1.6' : 'normal'};
  }
  #math-baseline { display: inline-block; width: 0; height: 0; }
  .katex-display { margin: 0; }
</style>
</head>
<body>
<div id="math-root">${markup}${display ? '' : '<span id="math-baseline"></span>'}</div>
<script>
(function() {
  function reportSize() {
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
  }
  var fonts = document.fonts;
  if (fonts && fonts.ready) {
    // Lay out first so the fonts this formula uses are already loading when ready is read.
    document.getElementById('math-root').getBoundingClientRect();
    fonts.ready.then(reportSize, reportSize);
  } else {
    reportSize();
  }
})();
</script>
</body>
</html>`;
}

export function MathBlock({ latex, display, color }: MathBlockProps) {
  const { colors } = useTheme();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const fontSize = chatTypography.body.fontSize * fontScale;
  const cacheKey = sizeKey(latex, display, fontSize);
  const [size, setSize] = useState<MathSize>(() => initialSize(display, cacheKey));
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [webViewError, setWebViewError] = useState(false);
  const [reclaims, setReclaims] = useState(0);

  const math = useMemo(() => renderMathMarkup(latex, display, 'htmlAndMathml'), [latex, display]);
  const html = useMemo(
    () =>
      math.ok
        ? buildMathDocument(math.markup, display, colors, {
            fontSize,
            ...(color ? { color } : {}),
          })
        : '',
    [math, display, colors, fontSize, color],
  );
  const spoken = useMemo(() => (math.ok ? speakMathMarkup(math.mathml) : ''), [math]);

  useEffect(() => {
    setWebViewError(false);
    setReclaims(0);
    setSize(initialSize(display, cacheKey));
  }, [cacheKey, display]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const measured = readMathSize(event.nativeEvent.data, display);
      if (!measured) return;
      rememberSize(cacheKey, measured);
      setSize((current) =>
        current.height === measured.height &&
        current.width === measured.width &&
        current.baselineOffset === measured.baselineOffset
          ? current
          : measured,
      );
    },
    [display, cacheKey],
  );

  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setFrameWidth((current) => (current === measured ? current : measured));
  }, []);

  if (!latex.trim()) return null;
  if (!math.ok || webViewError) return <MathFallback latex={latex} display={display} />;

  const onWebViewError = (error: unknown) => {
    console.warn('[MathBlock] WebView render failed:', error);
    setWebViewError(true);
  };

  const onReclaimed = () => {
    if (reclaims < MAX_RECLAIM_RECOVERIES) setReclaims((value) => value + 1);
    else setWebViewError(true);
  };

  const inlineLimit = Math.max(0, windowWidth - INLINE_GUTTER);
  const limit = display ? frameWidth : inlineLimit;
  const overflows = size.width !== null && limit !== null && size.width > limit;
  const speech = spoken || latex;

  const webView = (
    <WebView
      key={reclaims}
      source={{ html }}
      style={styles.webView}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      onMessage={onMessage}
      onError={(event) => onWebViewError(event.nativeEvent)}
      onHttpError={(event) => onWebViewError(event.nativeEvent)}
      onContentProcessDidTerminate={onReclaimed}
      onRenderProcessGone={onReclaimed}
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
  );
  const frame: ReactNode = overflows ? (
    <SideScroller
      testID="math-scroll"
      bounces={false}
      showsHorizontalScrollIndicator
      contentContainerStyle={{ width: size.width ?? undefined, height: size.height }}
    >
      {webView}
    </SideScroller>
  ) : (
    webView
  );

  return (
    <View
      onLayout={display ? onFrameLayout : undefined}
      style={[
        display ? styles.blockContainer : styles.inlineContainer,
        { height: size.height },
        !display && size.width !== null ? { width: overflows ? inlineLimit : size.width } : null,
        !display && size.baselineOffset > 0
          ? { transform: [{ translateY: size.baselineOffset }] }
          : null,
      ]}
      accessibilityLabel={display ? `Math equation: ${speech}` : `Inline math: ${speech}`}
      accessibilityRole="image"
    >
      {frame}
    </View>
  );
}

export function MathFallback({ latex, display }: MathBlockProps) {
  const colors = useThemeColors();
  if (display) {
    return (
      <View style={[styles.fallbackBlock, { backgroundColor: `${colors.teal}14` }]}>
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
  },
  fallbackText: {
    fontFamily: codeFontFamily,
    fontStyle: 'italic',
    fontSize: typeScale.subhead,
    textAlign: 'center',
    lineHeight: 22,
  },
  fallbackInline: {
    fontFamily: codeFontFamily,
    fontStyle: 'italic',
    fontSize: typeScale.footnote,
  },
});
