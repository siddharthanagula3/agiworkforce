import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { buildChangeReview, resolveReview, type ReviewPiece } from '@agiworkforce/artifacts';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { translatePlural } from '@/src/i18n/plural';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';

export const REVIEW_CHANGES_LABEL = 'Review changes';
export const REVIEW_SAVED_MESSAGE = 'Saved your choices as a new version';
export const REVIEW_UNAVAILABLE_MESSAGE =
  'These versions differ too much to review change by change. Use Show changes, or restore a version from the history.';

const CONTEXT_CHARS = 60;

interface ArtifactChangesReviewProps {
  previous: string;
  next: string;
  fromVersion: number;
  toVersion: number;
  bottomInset: number;
  onApply: (text: string) => void;
  onClose: () => void;
}

interface ReviewRow {
  index: number;
  before: string;
  removed: string;
  added: string;
  after: string;
}

function contextBefore(piece: ReviewPiece | undefined): string {
  if (piece?.kind !== 'same') return '';
  const tail = piece.text.slice(-CONTEXT_CHARS);
  return tail.slice(tail.lastIndexOf('\n') + 1);
}

function contextAfter(piece: ReviewPiece | undefined): string {
  if (piece?.kind !== 'same') return '';
  const head = piece.text.slice(0, CONTEXT_CHARS);
  const lineEnd = head.indexOf('\n');
  return lineEnd >= 0 ? head.slice(0, lineEnd) : head;
}

function reviewRows(pieces: readonly ReviewPiece[]): ReviewRow[] {
  return pieces.flatMap((piece, position) =>
    piece.kind === 'change'
      ? [
          {
            index: piece.index,
            before: contextBefore(pieces[position - 1]),
            removed: piece.removed,
            added: piece.added,
            after: contextAfter(pieces[position + 1]),
          },
        ]
      : [],
  );
}

function spokenChange(row: ReviewRow, undone: boolean): string {
  const removed = row.removed ? `${undone ? 'Kept' : 'Removed'}: ${row.removed.trim()}. ` : '';
  const added = row.added ? `${undone ? 'Undone' : 'Added'}: ${row.added.trim()}. ` : '';
  return `Change ${row.index + 1}. ${removed}${added}`.trim();
}

function ReviewAction({
  label,
  onPress,
  disabled = false,
  emphasized = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={{
        minHeight: FULL_SCREEN_TOUCH_TARGET,
        minWidth: FULL_SCREEN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontSize: typeScale.subhead,
          fontWeight: emphasized ? '600' : '500',
          color: emphasized ? colors.textPrimary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

export function ArtifactChangesReview({
  previous,
  next,
  fromVersion,
  toVersion,
  bottomInset,
  onApply,
  onClose,
}: ArtifactChangesReviewProps) {
  const colors = useThemeColors();
  const review = useMemo(() => buildChangeReview(previous, next), [previous, next]);
  const rows = useMemo(() => (review ? reviewRows(review.pieces) : []), [review]);
  const [undone, setUndone] = useState<ReadonlySet<number>>(() => new Set());

  if (!review) {
    return (
      <View style={{ flex: 1, padding: spacing.lg }} testID="artifact-changes-review">
        <Text
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{ fontSize: typeScale.body, color: colors.textSecondary }}
        >
          {REVIEW_UNAVAILABLE_MESSAGE}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <ReviewAction label="Cancel" onPress={onClose} />
        </View>
      </View>
    );
  }

  const toggle = (index: number) =>
    setUndone((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(index)) nextSet.delete(index);
      else nextSet.add(index);
      return nextSet;
    });
  const kept = review.changeCount - undone.size;
  const summary = `Version ${toVersion} against version ${fromVersion}: ${translatePlural(
    'chat',
    'counts.changes',
    review.changeCount,
    { one: '{{count}} change', other: '{{count}} changes' },
  )}, keeping ${kept}`;

  const header = (
    <View style={{ marginBottom: spacing.sm }}>
      <Text
        accessibilityLiveRegion="polite"
        testID="artifact-review-summary"
        style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
      >
        {summary}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <ReviewAction label="Keep all" onPress={() => setUndone(new Set())} />
        <ReviewAction
          label="Undo all"
          onPress={() =>
            setUndone(new Set(Array.from({ length: review.changeCount }, (_, index) => index)))
          }
        />
        <ReviewAction label="Cancel" onPress={onClose} />
        <ReviewAction
          label="Save my choices"
          emphasized
          disabled={undone.size === 0}
          onPress={() => onApply(resolveReview(review, undone))}
          testID="artifact-review-apply"
        />
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomInset + spacing['2xl'] }}
      data={rows}
      keyExtractor={(row) => String(row.index)}
      ListHeaderComponent={header}
      testID="artifact-changes-review"
      renderItem={({ item }) => {
        const isUndone = undone.has(item.index);
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: typeScale.body,
                color: colors.textPrimary,
              }}
              accessibilityLabel={spokenChange(item, isUndone)}
              testID={`artifact-review-change-${item.index}`}
            >
              {item.before ? <Text style={{ color: colors.textMuted }}>{item.before}</Text> : null}
              {item.removed ? (
                <Text
                  style={{
                    backgroundColor: colors.diffRemovedFill,
                    color: colors.diffRemovedText,
                    textDecorationLine: isUndone ? 'none' : 'line-through',
                  }}
                >
                  {item.removed}
                </Text>
              ) : null}
              {item.added ? (
                <Text
                  style={{
                    backgroundColor: colors.diffAddedFill,
                    color: colors.diffAddedText,
                    textDecorationLine: isUndone ? 'line-through' : 'underline',
                    opacity: isUndone ? 0.6 : 1,
                  }}
                >
                  {item.added}
                </Text>
              ) : null}
              {item.after ? <Text style={{ color: colors.textMuted }}>{item.after}</Text> : null}
            </Text>
            <PressableBox
              onPress={() => toggle(item.index)}
              accessibilityRole="button"
              accessibilityLabel={
                isUndone ? `Keep change ${item.index + 1}` : `Undo change ${item.index + 1}`
              }
              accessibilityState={{ selected: isUndone }}
              testID={`artifact-review-toggle-${item.index}`}
              style={{
                minHeight: FULL_SCREEN_TOUCH_TARGET,
                minWidth: FULL_SCREEN_TOUCH_TARGET,
                justifyContent: 'center',
                alignItems: 'flex-end',
                paddingLeft: spacing.sm,
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: '500',
                  color: colors.textSecondary,
                }}
              >
                {isUndone ? 'Keep' : 'Undo'}
              </Text>
            </PressableBox>
          </View>
        );
      }}
    />
  );
}
