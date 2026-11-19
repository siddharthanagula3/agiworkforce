import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { File } from 'expo-file-system';
import { FileSpreadsheet } from 'lucide-react-native';
import { WorkbookPreviewLimitError, readWorkbookSheets } from '@agiworkforce/unified-chat/tabular';
import { Button } from '@/components/ui/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { shareFile } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { DocumentFileView, rendersDocumentsInApp } from './DocumentFileView';
import { TabularGridView, type TabularSheet } from './TabularGridView';
import { useLocalFileCopy } from './useLocalFileCopy';
import type { FileViewerSource } from './viewerKind';

export const WORKBOOK_TOO_LARGE_TITLE = 'This workbook is too large to show here';
const WORKBOOK_EXTENSION = /\.xlsx$/i;

type WorkbookRead =
  | { status: 'loading' }
  | { status: 'ready'; sheets: TabularSheet[] }
  | { status: 'too-large' }
  | { status: 'unreadable' };

async function readWorkbookFile(uri: string): Promise<TabularSheet[]> {
  const sheets = readWorkbookSheets(await new File(uri).bytes());
  return sheets.map((sheet) => ({ name: sheet.name, content: sheet.csv }));
}

function useWorkbookSheets(uri: string | null): WorkbookRead {
  const [read, setRead] = useState<{ uri: string; result: WorkbookRead } | null>(null);

  useEffect(() => {
    if (!uri) return;
    let live = true;
    readWorkbookFile(uri).then(
      (sheets) => {
        if (live) {
          setRead({
            uri,
            result: sheets.length > 0 ? { status: 'ready', sheets } : { status: 'unreadable' },
          });
        }
      },
      (error: unknown) => {
        if (live) {
          setRead({
            uri,
            result:
              error instanceof WorkbookPreviewLimitError
                ? { status: 'too-large' }
                : { status: 'unreadable' },
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [uri]);

  return read && read.uri === uri ? read.result : { status: 'loading' };
}

function WorkbookStatus({
  testID,
  title,
  body,
  children,
}: {
  testID: string;
  title: string;
  body?: string;
  children: ReactNode;
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
      <FileSpreadsheet size={28} color={colors.textMuted} />
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
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
        {children}
      </View>
    </View>
  );
}

/** An XLSX file read on the device into a grid with one tab per sheet; the document view when it cannot be read. */
export function WorkbookFileView({ source }: { source: FileViewerSource }) {
  const { copy, retry } = useLocalFileCopy(source.url, source.fileName);
  const workbook = useWorkbookSheets(copy.status === 'ready' ? copy.uri : null);

  const handleShare = useCallback((uri: string) => {
    void shareFile(uri).catch((error: unknown) =>
      Alert.alert('Could not share file', toUserMessage(error, 'Try again in a moment.')),
    );
  }, []);

  if (copy.status === 'failed') {
    return (
      <WorkbookStatus
        testID="workbook-file-failed"
        title="Could not open this file"
        body={copy.message}
      >
        {copy.retryable ? (
          <Button title="Retry" variant="secondary" size="sm" onPress={retry} />
        ) : null}
      </WorkbookStatus>
    );
  }

  if (copy.status === 'loading' || workbook.status === 'loading') {
    return (
      <View
        testID="workbook-file-loading"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <LoadingIndicator size="large" accessibilityLabel={`Opening ${source.fileName}`} />
      </View>
    );
  }

  if (workbook.status === 'unreadable') return <DocumentFileView source={source} />;

  if (workbook.status === 'too-large') {
    if (rendersDocumentsInApp(source)) return <DocumentFileView source={source} />;
    return (
      <WorkbookStatus testID="workbook-file-too-large" title={WORKBOOK_TOO_LARGE_TITLE}>
        <Button
          title="Share"
          variant="secondary"
          size="sm"
          accessibilityLabel={`Share ${source.fileName}`}
          onPress={() => handleShare(copy.uri)}
        />
      </WorkbookStatus>
    );
  }

  return (
    <TabularGridView
      title={source.title.replace(WORKBOOK_EXTENSION, '')}
      content={workbook.sheets[0]?.content ?? ''}
      sheets={workbook.sheets}
    />
  );
}
