import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Share, View } from 'react-native';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  LayoutGrid,
  Share as ShareIcon,
} from 'lucide-react-native';
import type { CardType } from '@agiworkforce/unified-chat/message-format';
import {
  parseCalculation,
  parseComparison,
  parseRecipe,
  parseSteps,
  type ExtraSection,
  type ParsedCalculation,
} from '@agiworkforce/unified-chat/message-format-cards';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { storage } from '@/lib/mmkv';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { radii, useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { renderInlineMarkdown } from './MarkdownInline';
import { MathBlock } from './MathBlock';
import { SideScroller } from './SideScroller';

export type MessageFormatCardType = Exclude<CardType, null>;

const LABELS: Record<MessageFormatCardType, string> = {
  recipe: 'recipe',
  comparison: 'comparison',
  steps: 'steps',
  calculation: 'calculation',
};

const ICON_SIZE = 16;
const ICON_HIT_SLOP = 12;

export function messageFormatToggleLabel(cardType: MessageFormatCardType, open: boolean): string {
  return open ? `Hide ${LABELS[cardType]} view` : `View as ${LABELS[cardType]}`;
}

export function stepsProgressKey(conversationId: string, messageId: string): string {
  return `agi:steps-card:${conversationId}:m:${messageId}`;
}

function readCompletedSteps(key: string): Set<number> {
  try {
    const raw = storage.getString(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0),
    );
  } catch {
    return new Set();
  }
}

function writeCompletedSteps(key: string, completed: ReadonlySet<number>): void {
  try {
    if (completed.size === 0) {
      storage.delete(key);
    } else {
      storage.set(key, JSON.stringify([...completed].sort((a, b) => a - b)));
    }
  } catch (error) {
    console.warn('[MessageFormatCard] steps progress not saved', error);
  }
}

function toggled(set: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(set);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

function CardFrame({ testID, children }: { testID: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      style={{
        marginTop: spacing.sm,
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
      }}
    >
      {children}
    </View>
  );
}

function CardTitle({ title, description }: { title: string; description?: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 2 }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.headline, fontWeight: '600', color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textMuted }}
    >
      {children}
    </Text>
  );
}

function BodyText({
  children,
  muted,
  struck,
}: {
  children: ReactNode;
  muted?: boolean;
  struck?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Text
      selectable
      style={{
        flexShrink: 1,
        fontSize: typeScale.body,
        color: muted || struck ? colors.textMuted : colors.textPrimary,
        ...(struck ? { textDecorationLine: 'line-through' as const } : {}),
      }}
    >
      {children}
    </Text>
  );
}

function CheckRow({
  checked,
  label,
  accessibilityLabel,
  onToggle,
  testID,
}: {
  checked: boolean;
  label: ReactNode;
  accessibilityLabel: string;
  onToggle: () => void;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      testID={testID}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      {checked ? (
        <Check size={ICON_SIZE} color={colors.agentSuccess} />
      ) : (
        <Circle size={ICON_SIZE} color={colors.textMuted} />
      )}
      {label}
    </PressableBox>
  );
}

function ExtraSections({
  sections,
  inlineMarkdown = false,
}: {
  sections: readonly ExtraSection[];
  inlineMarkdown?: boolean;
}) {
  const colors = useThemeColors();
  const visible = sections.filter((section) => section.lines.length > 0);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((section, index) => (
        <View
          key={`extra-${index}-${section.heading}`}
          testID="card-extra-section"
          style={{ gap: spacing.xs }}
        >
          {section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
          {section.lines.map((line, lineIndex) => (
            <BodyText key={`extra-${index}-${lineIndex}`}>
              {inlineMarkdown
                ? renderInlineMarkdown(line, `extra-${index}-${lineIndex}`, colors)
                : line}
            </BodyText>
          ))}
        </View>
      ))}
    </>
  );
}

function RecipeView({ content }: { content: string }) {
  const recipe = useMemo(() => parseRecipe(content), [content]);
  const [gathered, setGathered] = useState<Set<number>>(() => new Set());
  const details = [
    { label: 'Prep', value: recipe.prepTime },
    { label: 'Cook', value: recipe.cookTime },
    { label: 'Total', value: recipe.totalTime },
    { label: 'Servings', value: recipe.servings },
  ].filter((detail) => detail.value);

  return (
    <CardFrame testID="message-format-card.recipe">
      <CardTitle title={recipe.title} description={recipe.description} />
      {details.length > 0 ? (
        <BodyText muted>
          {details.map((detail) => `${detail.label}: ${detail.value}`).join(' · ')}
        </BodyText>
      ) : null}
      {recipe.ingredients.length > 0 ? (
        <View>
          <SectionHeading>{`Ingredients (${gathered.size}/${recipe.ingredients.length})`}</SectionHeading>
          {recipe.ingredients.map((ingredient, index) => {
            const checked = gathered.has(index);
            return (
              <CheckRow
                key={`ingredient-${index}`}
                checked={checked}
                accessibilityLabel={`Mark ${ingredient} as gathered`}
                onToggle={() => setGathered((prev) => toggled(prev, index))}
                label={<BodyText struck={checked}>{ingredient}</BodyText>}
              />
            );
          })}
        </View>
      ) : null}
      {recipe.instructions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeading>Instructions</SectionHeading>
          {recipe.instructions.map((step, index) => (
            <View key={`instruction-${index}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <BodyText muted>{`${index + 1}.`}</BodyText>
              <BodyText>{step}</BodyText>
            </View>
          ))}
        </View>
      ) : null}
      <ExtraSections sections={recipe.extraSections} />
    </CardFrame>
  );
}

function ComparisonView({ content }: { content: string }) {
  const colors = useThemeColors();
  const comparison = useMemo(() => parseComparison(content), [content]);
  const { items, winner, winnerReason, featureKeys } = comparison;
  const hasProsCons = items.some((item) => item.pros.length > 0 || item.cons.length > 0);
  const subtitle =
    comparison.title && !comparison.title.toLowerCase().includes('vs')
      ? comparison.title
      : undefined;

  return (
    <CardFrame testID="message-format-card.comparison">
      <CardTitle title={`${items[0].name} vs ${items[1].name}`} description={subtitle} />
      {hasProsCons
        ? items.map((item, index) => (
            <View key={`compare-${index}`} style={{ gap: spacing.xs }}>
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                {winner === item.name ? `${item.name} · Winner` : item.name}
              </Text>
              {item.pros.length > 0 ? (
                <View style={{ gap: 2 }}>
                  <SectionHeading>Pros</SectionHeading>
                  {item.pros.map((pro, proIndex) => (
                    <BodyText key={`pro-${index}-${proIndex}`}>{pro}</BodyText>
                  ))}
                </View>
              ) : null}
              {item.cons.length > 0 ? (
                <View style={{ gap: 2 }}>
                  <SectionHeading>Cons</SectionHeading>
                  {item.cons.map((con, conIndex) => (
                    <BodyText key={`con-${index}-${conIndex}`}>{con}</BodyText>
                  ))}
                </View>
              ) : null}
            </View>
          ))
        : null}
      {featureKeys.length > 0 ? (
        <SideScroller testID="message-format-card.features">
          <View>
            {[
              { key: 'Feature', first: items[0].name, second: items[1].name, header: true },
              ...featureKeys.map((key) => ({
                key,
                first: items[0].features[key] || '-',
                second: items[1].features[key] || '-',
                header: false,
              })),
            ].map((row, rowIndex) => (
              <View
                key={`feature-${rowIndex}`}
                style={{
                  flexDirection: 'row',
                  borderTopWidth: rowIndex === 0 ? 0 : 1,
                  borderColor: colors.borderLight,
                }}
              >
                {[row.key, row.first, row.second].map((cell, cellIndex) => (
                  <Text
                    key={`cell-${rowIndex}-${cellIndex}`}
                    selectable
                    style={{
                      width: 140,
                      paddingVertical: spacing.xs,
                      paddingEnd: spacing.sm,
                      fontSize: typeScale.subhead,
                      fontWeight: row.header || cellIndex === 0 ? '600' : '400',
                      color: cellIndex === 0 ? colors.textSecondary : colors.textPrimary,
                    }}
                  >
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </SideScroller>
      ) : null}
      {winner && winnerReason ? (
        <BodyText>
          <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{winner}</Text>
          {` ${winnerReason}`}
        </BodyText>
      ) : null}
      <ExtraSections sections={comparison.extraSections} />
    </CardFrame>
  );
}

function StepsView({
  content,
  conversationId,
  messageId,
}: {
  content: string;
  conversationId: string;
  messageId: string;
}) {
  const colors = useThemeColors();
  const parsed = useMemo(() => parseSteps(content), [content]);
  const key = stepsProgressKey(conversationId, messageId);
  const [completed, setCompleted] = useState<Set<number>>(() => readCompletedSteps(key));
  const [expanded, setExpanded] = useState<number | null>(0);

  useEffect(() => {
    setCompleted(readCompletedSteps(key));
  }, [key]);

  const toggleStep = useCallback(
    (index: number) => {
      setCompleted((prev) => {
        const next = toggled(prev, index);
        writeCompletedSteps(key, next);
        return next;
      });
    },
    [key],
  );

  const total = parsed.steps.length;
  const percent = total > 0 ? Math.round((completed.size / total) * 100) : 0;
  const allDone = total > 0 && completed.size === total;

  return (
    <CardFrame testID="message-format-card.steps">
      <CardTitle title={parsed.title} description={parsed.description} />
      <Text
        testID="message-format-card.steps-progress"
        accessibilityLiveRegion="polite"
        style={{ fontSize: typeScale.caption, color: colors.textMuted }}
      >
        {allDone ? 'All steps completed!' : `${completed.size}/${total} · ${percent}% complete`}
      </Text>
      <View>
        {parsed.steps.map((step, index) => {
          const done = completed.has(index);
          const open = expanded === index;
          const hasDetails = step.details.length > 0;
          return (
            <View key={`step-${index}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <PressableBox
                  onPress={() => toggleStep(index)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={
                    done ? `Mark step ${index + 1} incomplete` : `Mark step ${index + 1} complete`
                  }
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  {done ? (
                    <Check size={ICON_SIZE} color={colors.agentSuccess} />
                  ) : (
                    <Circle size={ICON_SIZE} color={colors.textMuted} />
                  )}
                </PressableBox>
                <PressableBox
                  onPress={hasDetails ? () => setExpanded(open ? null : index) : undefined}
                  disabled={!hasDetails}
                  accessibilityRole={hasDetails ? 'button' : undefined}
                  accessibilityState={hasDetails ? { expanded: open } : undefined}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <BodyText muted>{`${index + 1}.`}</BodyText>
                  <View style={{ flex: 1 }}>
                    <BodyText struck={done}>{step.title}</BodyText>
                  </View>
                  {hasDetails ? (
                    open ? (
                      <ChevronDown size={ICON_SIZE} color={colors.textMuted} />
                    ) : (
                      <ChevronRight size={ICON_SIZE} color={colors.textMuted} />
                    )
                  ) : null}
                </PressableBox>
              </View>
              {hasDetails && open ? (
                <View
                  style={{
                    paddingStart: 44 + spacing.lg,
                    gap: spacing.xs,
                    paddingBottom: spacing.sm,
                  }}
                >
                  {step.details.map((detail, detailIndex) => (
                    <BodyText key={`detail-${index}-${detailIndex}`} muted>
                      {detail}
                    </BodyText>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <ExtraSections sections={parsed.extraSections} />
    </CardFrame>
  );
}

function Formula({
  expression,
  isLatex,
  display = true,
}: {
  expression: string;
  isLatex: boolean;
  display?: boolean;
}) {
  const colors = useThemeColors();
  if (isLatex) return <MathBlock latex={expression} display={display} />;
  return (
    <Text
      selectable
      style={{
        fontSize: typeScale.body,
        color: colors.textPrimary,
        fontVariant: ['tabular-nums'],
      }}
    >
      {expression}
    </Text>
  );
}

function hasCalculation(calc: ParsedCalculation): boolean {
  return calc.formulas.length > 0 || calc.steps.length > 0 || calc.result !== '';
}

function CalculationView({ calc }: { calc: ParsedCalculation }) {
  const colors = useThemeColors();
  const [showSteps, setShowSteps] = useState(false);
  const { status, copy } = useCopyAction();
  const handleShare = useCallback(() => {
    void Share.share({ message: calc.result }).catch((error: unknown) => {
      console.warn('[MessageFormatCard] share failed', error);
    });
  }, [calc.result]);
  const stepsLabel = `${calc.steps.length} intermediate ${calc.steps.length === 1 ? 'step' : 'steps'}`;

  return (
    <CardFrame testID="message-format-card.calculation">
      <CardTitle
        title={calc.title}
        description={
          calc.description
            ? renderInlineMarkdown(calc.description, 'calculation-description', colors)
            : undefined
        }
      />
      {calc.formulas.map((formula, index) => (
        <View key={`formula-${index}`} style={{ gap: spacing.xs }}>
          {formula.label ? <SectionHeading>{formula.label}</SectionHeading> : null}
          <Formula expression={formula.expression} isLatex={formula.isLatex} />
        </View>
      ))}
      {calc.steps.length > 0 ? (
        <View>
          <PressableBox
            onPress={() => setShowSteps((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showSteps }}
            accessibilityLabel="Toggle calculation steps"
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          >
            {showSteps ? (
              <ChevronDown size={ICON_SIZE} color={colors.textMuted} />
            ) : (
              <ChevronRight size={ICON_SIZE} color={colors.textMuted} />
            )}
            <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
              {stepsLabel}
            </Text>
          </PressableBox>
          {showSteps
            ? calc.steps.map((step, index) => (
                <View
                  key={`calc-step-${index}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
                >
                  <BodyText muted>
                    {renderInlineMarkdown(step.label, `calc-step-${index}-label`, colors)}
                  </BodyText>
                  <BodyText>
                    {renderInlineMarkdown(step.value, `calc-step-${index}-value`, colors)}
                  </BodyText>
                </View>
              ))
            : null}
        </View>
      ) : null}
      {calc.result ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <SectionHeading>{calc.resultLabel}</SectionHeading>
            {calc.resultIsLatex ? (
              <Formula expression={calc.result} isLatex display={false} />
            ) : (
              <Text
                testID="message-format-card.result"
                selectable
                style={{ fontSize: typeScale.title2, fontWeight: '700', color: colors.textPrimary }}
              >
                {calc.result}
              </Text>
            )}
            {calc.unit ? (
              <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                {calc.unit}
              </Text>
            ) : null}
          </View>
          <PressableBox
            onPress={() => void copy(calc.result)}
            accessibilityRole="button"
            accessibilityLabel={copyControlLabel(status, 'Copy result')}
            hitSlop={ICON_HIT_SLOP}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            {status === 'copied' ? (
              <Check size={ICON_SIZE} color={colors.agentSuccess} />
            ) : (
              <Copy size={ICON_SIZE} color={colors.textMuted} />
            )}
          </PressableBox>
          <PressableBox
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share result"
            hitSlop={ICON_HIT_SLOP}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <ShareIcon size={ICON_SIZE} color={colors.textMuted} />
          </PressableBox>
        </View>
      ) : null}
      <ExtraSections sections={calc.extraSections} inlineMarkdown />
    </CardFrame>
  );
}

export function MessageFormatCard({
  content,
  cardType,
  conversationId,
  messageId,
}: {
  content: string;
  cardType: MessageFormatCardType;
  conversationId: string;
  messageId: string;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const label = messageFormatToggleLabel(cardType, open);
  const calculation = useMemo(
    () => (cardType === 'calculation' ? parseCalculation(content) : null),
    [cardType, content],
  );
  if (calculation && !hasCalculation(calculation)) return null;

  return (
    <View testID="message-format-card" style={{ marginTop: spacing.xs }}>
      <PressableBox
        testID="message-format-card.toggle"
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        style={{
          alignSelf: 'flex-start',
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <LayoutGrid size={ICON_SIZE} color={colors.textMuted} />
        <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>{label}</Text>
      </PressableBox>
      {open ? (
        cardType === 'recipe' ? (
          <RecipeView content={content} />
        ) : cardType === 'comparison' ? (
          <ComparisonView content={content} />
        ) : cardType === 'steps' ? (
          <StepsView content={content} conversationId={conversationId} messageId={messageId} />
        ) : calculation ? (
          <CalculationView calc={calculation} />
        ) : null
      ) : null}
    </View>
  );
}
