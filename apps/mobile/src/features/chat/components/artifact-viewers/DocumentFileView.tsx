import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { FileText } from 'lucide-react-native';
import { documentClassFor } from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { shareFile } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { PdfFileView } from './PdfFileView';
import { PDF_VIEWER_HTML } from './pdfViewerHtml';
import type { PdfViewerFailure } from './pdfViewerBridge';
import { useLocalFileCopy } from './useLocalFileCopy';
import type { FileViewerSource } from './viewerKind';

export function documentFrameUri(fileUri: string, page?: number): string {
  return page && page > 0 ? `${fileUri}#page=${page}` : fileUri;
}

/** The document may move between its own pages; it never leaves the file it was opened from. */
export function isOwnDocumentNavigation(url: string, fileUri: string): boolean {
  return url === fileUri || url.startsWith(`${fileUri}#`);
}

function isPdfFile(source: FileViewerSource): boolean {
  return documentClassFor(source.fileName, source.mimeType)?.extractor === 'pdf';
}

export function rendersDocumentsInApp(source: FileViewerSource): boolean {
  if (Platform.OS === 'ios') return true;
  return Platform.OS === 'android' && PDF_VIEWER_HTML !== null && isPdfFile(source);
}

function StatusPanel({
  title,
  body,
  children,
  testID,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing['2xl'],
        gap: spacing.md,
      }}
    >
      <FileText size={28} color={colors.textMuted} />
      <Text
        style={{
          fontSize: typeScale.callout,
          fontWeight: '600',
          color: colors.textPrimary,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={{ fontSize: typeScale.footnote, color: colors.textMuted, textAlign: 'center' }}
        >
          {body}
        </Text>
      ) : null}
      {children ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A PDF or Office file drawn by the system document view with no scripts and no way out; on Android
 * a PDF is drawn by the bundled pdf.js page instead, and an Office file is handed to another app.
 */
export function DocumentFileView({ source, page }: { source: FileViewerSource; page?: number }) {
  const { copy, retry } = useLocalFileCopy(source.url, source.fileName);
  const [frame, setFrame] = useState(0);
  const [failure, setFailure] = useState<PdfViewerFailure | null>(null);

  const handleShare = useCallback((uri: string) => {
    void shareFile(uri).catch((error: unknown) =>
      Alert.alert('Could not share file', toUserMessage(error, 'Try again in a moment.')),
    );
  }, []);

  if (copy.status === 'loading') {
    return (
      <View
        testID="document-file-loading"
        accessibilityLabel={`Opening ${source.fileName}`}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <LoadingIndicator size="large" />
      </View>
    );
  }

  if (copy.status === 'failed') {
    return (
      <StatusPanel
        testID="document-file-failed"
        title="Could not open this file"
        body={copy.message}
      >
        {copy.retryable ? (
          <Button title="Retry" variant="secondary" size="sm" onPress={retry} />
        ) : null}
      </StatusPanel>
    );
  }

  const shareButton = (
    <Button
      title="Share"
      variant="secondary"
      size="sm"
      accessibilityLabel={`Share ${source.fileName}`}
      onPress={() => handleShare(copy.uri)}
    />
  );

  if (!rendersDocumentsInApp(source)) {
    return (
      <StatusPanel
        testID="document-file-external"
        title={source.fileName}
        body="Open it in another app to read it."
      >
        {shareButton}
      </StatusPanel>
    );
  }

  if (failure) {
    return (
      <StatusPanel
        testID="document-file-render-failed"
        title="This file could not be shown here"
        {...(failure === 'password'
          ? { body: 'It is protected by a password. Share it to open it in another app.' }
          : {})}
      >
        <Button
          title="Retry"
          variant="secondary"
          size="sm"
          onPress={() => {
            setFailure(null);
            setFrame((value) => value + 1);
          }}
        />
        {shareButton}
      </StatusPanel>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <PdfFileView
        key={frame}
        uri={copy.uri}
        fileName={source.fileName}
        {...(page ? { page } : {})}
        onFailed={setFailure}
      />
    );
  }

  return (
    <WebView
      key={frame}
      testID="document-file-frame"
      source={{ uri: documentFrameUri(copy.uri, page) }}
      style={{ flex: 1 }}
      originWhitelist={['file://*']}
      allowingReadAccessToURL={copy.uri}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      onShouldStartLoadWithRequest={(request) => isOwnDocumentNavigation(request.url, copy.uri)}
      onError={() => setFailure('error')}
      accessibilityLabel={source.fileName}
    />
  );
}
