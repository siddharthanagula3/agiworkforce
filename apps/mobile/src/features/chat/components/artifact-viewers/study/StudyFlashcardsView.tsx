import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react-native';
import type { FlashcardSet } from '@agiworkforce/unified-chat/study-set';
import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';

function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

const ICON_CONTROL = {
  width: FULL_SCREEN_TOUCH_TARGET,
  height: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export interface StudyFlashcardsViewProps {
  set: FlashcardSet;
}

export function StudyFlashcardsView({ set }: StudyFlashcardsViewProps) {
  const colors = useThemeColors();
  const [order, setOrder] = useState<number[]>(() => set.cards.map((_, index) => index));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(() => new Set());
  const total = order.length;
  const cardIndex = order[Math.min(position, total - 1)] ?? 0;
  const card = set.cards[cardIndex]!;
  const title = set.title || 'Flashcards';
  const learning = useMemo(
    () => set.cards.map((_, index) => index).filter((index) => !known.has(index)),
    [set.cards, known],
  );

  const go = (next: number) => {
    setPosition(Math.max(0, Math.min(total - 1, next)));
    setFlipped(false);
  };

  const mark = (knowsIt: boolean) => {
    setKnown((current) => {
      const next = new Set(current);
      if (knowsIt) next.add(cardIndex);
      else next.delete(cardIndex);
      return next;
    });
    if (position < total - 1) go(position + 1);
    else setFlipped(false);
  };

  const restartWith = (next: number[]) => {
    setOrder(next);
    setPosition(0);
    setFlipped(false);
  };

  const iconColor = (enabled: boolean) => (enabled ? colors.textPrimary : colors.textMuted);

  return (
    <View
      testID="flashcards-view"
      accessibilityLabel={title}
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text
          style={{ flex: 1, fontSize: typeScale.caption, color: colors.textMuted }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          testID="flashcards-progress"
          style={{ fontSize: typeScale.caption, color: colors.textMuted }}
        >
          Card {position + 1} of {total} · {known.size} known
        </Text>
      </View>

      <PressableBox
        testID="flashcard"
        accessibilityRole="button"
        accessibilityLabel={`${flipped ? 'Back' : 'Front'}: ${flipped ? card.back : card.front}`}
        accessibilityHint={flipped ? 'Shows the front' : 'Shows the back'}
        onPress={() => setFlipped((value) => !value)}
        style={{
          minHeight: FULL_SCREEN_TOUCH_TARGET * 4,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing['2xl'],
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.textMuted,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {flipped ? 'Back' : 'Front'}
        </Text>
        <Text
          testID="flashcard-text"
          style={{ fontSize: typeScale.headline, color: colors.textPrimary, textAlign: 'center' }}
        >
          {flipped ? card.back : card.front}
        </Text>
      </PressableBox>

      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}
      >
        <PressableBox
          testID="flashcard-previous"
          accessibilityRole="button"
          accessibilityLabel="Previous card"
          accessibilityState={{ disabled: position === 0 }}
          disabled={position === 0}
          onPress={() => go(position - 1)}
          style={ICON_CONTROL}
        >
          <ChevronLeft size={22} color={iconColor(position > 0)} />
        </PressableBox>
        <PressableBox
          testID="flashcard-next"
          accessibilityRole="button"
          accessibilityLabel="Next card"
          accessibilityState={{ disabled: position >= total - 1 }}
          disabled={position >= total - 1}
          onPress={() => go(position + 1)}
          style={ICON_CONTROL}
        >
          <ChevronRight size={22} color={iconColor(position < total - 1)} />
        </PressableBox>
        {flipped ? (
          <>
            <Button
              title="Still learning"
              variant="outline"
              onPress={() => mark(false)}
              testID="flashcard-again"
            />
            <Button title="Got it" onPress={() => mark(true)} testID="flashcard-known" />
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        <PressableBox
          testID="flashcards-shuffle"
          accessibilityRole="button"
          accessibilityLabel="Shuffle cards"
          onPress={() => restartWith(shuffled(set.cards.length))}
          style={ICON_CONTROL}
        >
          <Shuffle size={20} color={colors.textPrimary} />
        </PressableBox>
      </View>
      {known.size > 0 && learning.length > 0 ? (
        <Button
          title={`Review ${learning.length} still learning`}
          variant="ghost"
          onPress={() => restartWith(learning)}
          testID="flashcards-review-learning"
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}
