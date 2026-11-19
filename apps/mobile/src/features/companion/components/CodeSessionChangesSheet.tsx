import { Modal, ScrollView, View } from 'react-native';
import { FileEdit, FilePlus, FlaskConical, X } from 'lucide-react-native';
import { Badge } from '@/components/ui/Badge';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { CodeLinesScroller } from '@/src/features/settings/code/CodeLinesScroller';
import { radii, useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import type { RemoteCodeThread } from '../remote-code/store';
import { CODE_SESSION_COPY as COPY } from './codeSessionTimeline';

const ICON_SIZE = 14;

function SectionHeading({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.textMuted, fontSize: typeScale.footnote, fontWeight: '600' }}
    >
      {children}
    </Text>
  );
}

function testCounts(run: RemoteCodeThread['testRuns'][number]): string {
  return (
    [
      run.passed !== null ? `${run.passed} passed` : null,
      run.failed !== null ? `${run.failed} failed` : null,
      run.skipped !== null ? `${run.skipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(' · ') || COPY.noCounts
  );
}

export function CodeSessionChangesSheet({
  visible,
  thread,
  onClose,
}: {
  visible: boolean;
  thread: RemoteCodeThread;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const created = thread.fileChanges.filter((change) => change.kind === 'created');
  const modified = thread.fileChanges.filter((change) => change.kind === 'modified');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <View
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: dialogPadding,
            paddingRight: 8,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.callout,
              fontWeight: '600',
            }}
          >
            {COPY.changes}
          </Text>
          <PressableBox
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={COPY.closeChanges}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={colors.textSecondary} />
          </PressableBox>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: dialogPadding,
            paddingBottom: 40,
            gap: 20,
          }}
        >
          {thread.testRuns.length > 0 ? (
            <View style={{ gap: 12 }}>
              <SectionHeading>{COPY.tests}</SectionHeading>
              {[...thread.testRuns].reverse().map((run) => (
                <View key={run.toolCallId} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FlaskConical
                      size={ICON_SIZE}
                      color={run.status === 'passed' ? colors.agentSuccess : colors.agentError}
                    />
                    <Text
                      variant="mono"
                      numberOfLines={1}
                      style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                    >
                      {run.command}
                    </Text>
                    <Badge
                      label={run.status === 'passed' ? 'Passed' : 'Failed'}
                      color={run.status === 'passed' ? 'green' : 'red'}
                    />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                    {testCounts(run)}
                  </Text>
                  {run.status === 'failed' && run.output ? (
                    <Text
                      variant="mono"
                      selectable
                      style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
                    >
                      {run.output}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {thread.fileChanges.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionHeading>{COPY.files}</SectionHeading>
              {created.map((change) => (
                <View
                  key={`created:${change.path}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <FilePlus size={ICON_SIZE} color={colors.agentSuccess} />
                  <Text
                    variant="mono"
                    numberOfLines={1}
                    style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                  >
                    {change.path}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                    {COPY.newFile}
                  </Text>
                </View>
              ))}
              {modified.map((change) => (
                <View
                  key={`modified:${change.path}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <FileEdit size={ICON_SIZE} color={colors.agentActive} />
                  <Text
                    variant="mono"
                    numberOfLines={1}
                    style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                  >
                    {change.path}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {thread.diffs.map((diff) => (
            <View key={`diff:${diff.path}`} style={{ gap: 8 }}>
              <SectionHeading>{diff.path}</SectionHeading>
              <View
                style={{
                  borderRadius: radii.md,
                  padding: 10,
                  backgroundColor: colors.surfaceHover,
                }}
              >
                <CodeLinesScroller testID="remote-code-diff">
                  <View>
                    {diff.patch.split('\n').map((line, index) => (
                      <Text
                        key={index}
                        variant="mono"
                        style={{
                          fontSize: typeScale.caption,
                          color: line.startsWith('+')
                            ? colors.agentSuccess
                            : line.startsWith('-')
                              ? colors.agentError
                              : colors.textSecondary,
                        }}
                      >
                        {line || ' '}
                      </Text>
                    ))}
                  </View>
                </CodeLinesScroller>
              </View>
              {diff.truncated ? (
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  {COPY.diffTruncated}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
