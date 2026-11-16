import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Button } from '@/components/ui/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';
import { FILE_UNAVAILABLE_MESSAGE, useLocalFileCopy } from './useLocalFileCopy';
import { TabularGridView } from './TabularGridView';
import type { FileViewerSource } from './viewerKind';

const MONOSPACE = codeFontFamily;

type FileText =
  { status: 'loading' } | { status: 'ready'; text: string } | { status: 'failed'; message: string };

function useFileText(source: FileViewerSource): { text: FileText; retry: () => void } {
  const { copy, retry } = useLocalFileCopy(source.url, source.fileName);
  const [read, setRead] = useState<FileText>({ status: 'loading' });
  const readyUri = copy.status === 'ready' ? copy.uri : null;

  useEffect(() => {
    if (!readyUri) return;
    let live = true;
    setRead({ status: 'loading' });
    readAsStringAsync(readyUri).then(
      (text) => {
        if (live) setRead({ status: 'ready', text });
      },
      (error: unknown) => {
        if (live) {
          setRead({ status: 'failed', message: toUserMessage(error, FILE_UNAVAILABLE_MESSAGE) });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [readyUri]);

  if (copy.status === 'failed') return { text: copy, retry };
  if (copy.status === 'loading') return { text: copy, retry };
  return { text: read, retry };
}

function FileTextState({ text, retry }: { text: FileText; retry: () => void }) {
  const colors = useThemeColors();
  if (text.status === 'loading') {
    return (
      <View
        testID="text-file-loading"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <LoadingIndicator size="large" />
      </View>
    );
  }
  if (text.status === 'failed') {
    return (
      <View
        testID="text-file-failed"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
      >
        <Text style={{ fontSize: typeScale.callout, color: colors.textPrimary }}>
          Could not open this file
        </Text>
        <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>
          {text.message}
        </Text>
        <Button title="Retry" variant="secondary" size="sm" onPress={retry} />
      </View>
    );
  }
  return null;
}

export function TextFileView({ source }: { source: FileViewerSource }) {
  const colors = useThemeColors();
  const { text, retry } = useFileText(source);
  const lines = useMemo(
    () => (text.status === 'ready' ? text.text.replace(/\r\n?/g, '\n').split('\n') : []),
    [text],
  );
  if (text.status !== 'ready') return <FileTextState text={text} retry={retry} />;
  if (!text.text.trim()) {
    return (
      <View
        testID="text-file-empty"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: typeScale.body, color: colors.textMuted }}>
          This file is empty.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      testID="text-file-lines"
      data={lines}
      keyExtractor={(_, index) => String(index)}
      initialNumToRender={60}
      contentContainerStyle={{ padding: spacing.lg }}
      renderItem={({ item }) => (
        <Text
          selectable
          style={{
            fontFamily: MONOSPACE,
            fontSize: typeScale.footnote,
            color: colors.textPrimary,
          }}
        >
          {item || ' '}
        </Text>
      )}
    />
  );
}

export function TableFileView({ source }: { source: FileViewerSource }) {
  const { text, retry } = useFileText(source);
  if (text.status !== 'ready') return <FileTextState text={text} retry={retry} />;
  return <TabularGridView title={source.title} content={text.text} />;
}
