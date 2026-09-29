import { useMemo } from 'react';
import { FlatList, Platform, ScrollView, View } from 'react-native';
import {
  artifactChanges,
  type ArtifactChangeKind,
  type ArtifactChangeRun,
  type ArtifactChangeUnit,
} from '@agiworkforce/artifacts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { translatePlural } from '@/src/i18n/plural';

interface ArtifactChangesViewProps {
  previous: string;
  next: string;
  unit: ArtifactChangeUnit;
  fromVersion: number;
  bottomInset: number;
}

interface ChangedLine {
  key: string;
  kind: ArtifactChangeKind;
  text: string;
}

const MONOSPACE = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const LINE_SIGNS: Record<ArtifactChangeKind, string> = { same: '', added: '+', removed: '-' };
const LINE_LABELS: Record<ArtifactChangeKind, string> = {
  same: '',
  added: 'Added line: ',
  removed: 'Removed line: ',
};

function spoken(runs: readonly ArtifactChangeRun[]): string {
  return runs
    .map((run) =>
      run.kind === 'added'
        ? ` Added: ${run.text}. End of addition. `
        : run.kind === 'removed'
          ? ` Removed: ${run.text}. End of removal. `
          : run.text,
    )
    .join('');
}

export function ArtifactChangesView({
  previous,
  next,
  unit,
  fromVersion,
  bottomInset,
}: ArtifactChangesViewProps) {
  const colors = useThemeColors();
  const changes = useMemo(() => artifactChanges(previous, next, unit), [previous, next, unit]);
  const lines = useMemo<ChangedLine[]>(
    () =>
      changes.unit === 'line'
        ? changes.runs.flatMap((run, runIndex) =>
            run.text.split('\n').map((text, lineIndex) => ({
              key: `${runIndex}:${lineIndex}`,
              kind: run.kind,
              text,
            })),
          )
        : [],
    [changes],
  );
  const fill = (kind: ArtifactChangeKind): string =>
    kind === 'added'
      ? colors.diffAddedFill
      : kind === 'removed'
        ? colors.diffRemovedFill
        : colors.transparent;
  const ink = (kind: ArtifactChangeKind): string =>
    kind === 'added'
      ? colors.diffAddedText
      : kind === 'removed'
        ? colors.diffRemovedText
        : colors.textPrimary;
  const summary =
    changes.added === 0 && changes.removed === 0
      ? `No changes since version ${fromVersion}`
      : `Since version ${fromVersion}: ${
          changes.unit === 'line'
            ? translatePlural('chat', 'counts.lines', changes.added, {
                one: '{{count}} line',
                other: '{{count}} lines',
              })
            : translatePlural('chat', 'counts.words', changes.added, {
                one: '{{count}} word',
                other: '{{count}} words',
              })
        } added, ${changes.removed} removed`;
  const header = (
    <Text
      style={{ fontSize: typeScale.caption, color: colors.textSecondary, marginBottom: 12 }}
      testID="artifact-changes-summary"
    >
      {summary}
    </Text>
  );

  if (changes.unit === 'line') {
    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
        data={lines}
        keyExtractor={(line) => line.key}
        ListHeaderComponent={header}
        testID="artifact-changes"
        renderItem={({ item }) => (
          <View
            style={{ flexDirection: 'row', backgroundColor: fill(item.kind) }}
            accessible
            accessibilityLabel={`${LINE_LABELS[item.kind]}${item.text}`}
          >
            <Text
              style={{
                width: 24,
                textAlign: 'center',
                fontFamily: MONOSPACE,
                fontSize: typeScale.footnote,
                lineHeight: 20,
                color: ink(item.kind),
              }}
            >
              {LINE_SIGNS[item.kind]}
            </Text>
            <Text
              style={{
                flex: 1,
                paddingRight: 12,
                fontFamily: MONOSPACE,
                fontSize: typeScale.footnote,
                lineHeight: 20,
                color: ink(item.kind),
              }}
            >
              {item.text || ' '}
            </Text>
          </View>
        )}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
      testID="artifact-changes"
    >
      {header}
      <Text
        style={{ fontSize: typeScale.body, lineHeight: 24, color: colors.textPrimary }}
        accessibilityLabel={spoken(changes.runs)}
        selectable
      >
        {changes.runs.map((run, index) =>
          run.kind === 'same' ? (
            run.text
          ) : (
            <Text
              key={index}
              style={{
                backgroundColor: fill(run.kind),
                color: ink(run.kind),
                textDecorationLine: run.kind === 'added' ? 'underline' : 'line-through',
              }}
            >
              {run.text}
            </Text>
          ),
        )}
      </Text>
    </ScrollView>
  );
}
