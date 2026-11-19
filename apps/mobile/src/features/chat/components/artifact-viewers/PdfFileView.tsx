import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { PDF_VIEWER_HTML } from './pdfViewerHtml';
import {
  PDF_VIEWER_CHUNK_BYTES,
  PDF_VIEWER_SILENCE_MS,
  isPdfViewerNavigation,
  parsePdfViewerMessage,
  pdfViewerChunkScript,
  pdfViewerStartScript,
  type PdfViewerFailure,
} from './pdfViewerBridge';

const VIEWER_SOURCE = PDF_VIEWER_HTML === null ? null : { html: PDF_VIEWER_HTML };
const VIEWER_ORIGINS = ['about:*'];

interface Transfer {
  run: number;
  offset: number;
  size: number;
}

/**
 * A PDF drawn by the bundled pdf.js page in a WebView that has no network and no file access:
 * the file goes in as bytes through the bridge, so nothing outside the page is ever read.
 */
export function PdfFileView({
  uri,
  fileName,
  page,
  onFailed,
}: {
  uri: string;
  fileName: string;
  page?: number;
  onFailed: (reason: PdfViewerFailure) => void;
}) {
  const colors = useThemeColors();
  const webView = useRef<WebView>(null);
  const transfer = useRef<Transfer>({ run: 0, offset: 0, size: 0 });
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failed = useRef(false);
  const [opened, setOpened] = useState<{ pages: number; page: number } | null>(null);

  const clearSilence = useCallback(() => {
    if (silence.current !== null) clearTimeout(silence.current);
    silence.current = null;
  }, []);

  const retire = useCallback(() => {
    transfer.current.run += 1;
    clearSilence();
  }, [clearSilence]);

  const fail = useCallback(
    (reason: PdfViewerFailure) => {
      if (failed.current) return;
      failed.current = true;
      retire();
      onFailed(reason);
    },
    [onFailed, retire],
  );

  const awaitViewer = useCallback(() => {
    clearSilence();
    silence.current = setTimeout(() => fail('error'), PDF_VIEWER_SILENCE_MS);
  }, [clearSilence, fail]);

  useEffect(() => {
    awaitViewer();
    return retire;
  }, [awaitViewer, retire]);

  const sendNext = useCallback(
    async (run: number) => {
      const state = transfer.current;
      if (run !== state.run || state.offset >= state.size) return;
      const length = Math.min(PDF_VIEWER_CHUNK_BYTES, state.size - state.offset);
      try {
        const encoded = await readAsStringAsync(uri, {
          encoding: EncodingType.Base64,
          position: state.offset,
          length,
        });
        if (run === transfer.current.run) {
          webView.current?.injectJavaScript(pdfViewerChunkScript(encoded));
        }
      } catch {
        if (run === transfer.current.run) fail('error');
      }
    },
    [fail, uri],
  );

  const start = useCallback(async () => {
    transfer.current.run += 1;
    const run = transfer.current.run;
    try {
      const info = await getInfoAsync(uri);
      if (run !== transfer.current.run) return;
      if (!info.exists || !info.size) {
        fail('invalid');
        return;
      }
      transfer.current = { run, offset: 0, size: info.size };
      webView.current?.injectJavaScript(
        pdfViewerStartScript({
          size: info.size,
          page: page && page > 0 ? page : 1,
          background: colors.background,
          border: colors.border,
        }),
      );
    } catch {
      if (run === transfer.current.run) fail('error');
    }
  }, [colors.background, colors.border, fail, page, uri]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parsePdfViewerMessage(event.nativeEvent.data);
      if (!message || failed.current) return;
      switch (message.type) {
        case 'ready':
          awaitViewer();
          void start();
          break;
        case 'received':
          awaitViewer();
          transfer.current.offset = message.bytes;
          void sendNext(transfer.current.run);
          break;
        case 'loaded':
          clearSilence();
          setOpened({
            pages: message.pages,
            page: Math.min(Math.max(page ?? 1, 1), message.pages),
          });
          break;
        case 'page':
          setOpened((current) => (current ? { ...current, page: message.page } : current));
          break;
        case 'failed':
          fail(message.reason);
          break;
      }
    },
    [awaitViewer, clearSilence, fail, page, sendNext, start],
  );

  const handleBroken = useCallback(() => fail('error'), [fail]);

  const frame = useMemo(
    () =>
      VIEWER_SOURCE ? (
        <WebView
          testID="pdf-file-frame"
          source={VIEWER_SOURCE}
          style={{ flex: 1, backgroundColor: colors.background }}
          originWhitelist={VIEWER_ORIGINS}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          incognito
          cacheEnabled={false}
          saveFormDataDisabled
          thirdPartyCookiesEnabled={false}
          geolocationEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction
          scalesPageToFit
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          textZoom={100}
          onShouldStartLoadWithRequest={(request) => isPdfViewerNavigation(request.url)}
          onMessage={handleMessage}
          onError={handleBroken}
          onHttpError={handleBroken}
          onRenderProcessGone={handleBroken}
          ref={webView}
          accessibilityLabel={fileName}
        />
      ) : null,
    [colors.background, fileName, handleBroken, handleMessage],
  );

  const caption = opened ? `Page ${opened.page} of ${opened.pages}` : null;

  return (
    <View testID="pdf-file-view" style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        {frame}
        {opened ? null : (
          <View
            testID="pdf-file-loading"
            accessibilityLabel={`Opening ${fileName}`}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.background,
              },
            ]}
          >
            <LoadingIndicator size="large" />
          </View>
        )}
      </View>
      {caption ? (
        <Text
          testID="pdf-file-page"
          style={{
            fontSize: typeScale.caption,
            color: colors.textMuted,
            textAlign: 'center',
            paddingVertical: spacing.xs,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
