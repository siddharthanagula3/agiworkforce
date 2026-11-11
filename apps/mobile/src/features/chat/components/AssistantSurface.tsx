import { useState, type ReactNode } from 'react';
import { Alert, Share, TextInput, View, useWindowDimensions } from 'react-native';
import { ArrowUpRight, ChevronDown } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import type { ColorScheme } from '@/src/ui/theme';
import { chatTypography, radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { checklistProgress, type AssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import { AnswerFormSurface } from './AnswerFormSurface';
import { CarouselSurface, GallerySurface } from './AnswerMediaSurfaces';
import {
  ChoiceRow,
  PanelHeader,
  PanelSection,
  SelectControl,
  SliderControl,
  StatusPill,
  SurfacePanel,
  type SurfaceTone,
} from './AnswerSurfaceKit';
import { ReportChart } from './ReportChart';

const PREVIEW_EDIT_NOTICE = 'Edits stay in this preview. Copy or share to keep them.';

type MobileAssistantFence = Exclude<AssistantFence, { kind: 'code' }>;

const WIDE_LAYOUT_MIN_WIDTH = 600;

export function canRenderAssistantSurface(fence: AssistantFence): fence is MobileAssistantFence {
  return fence.kind !== 'code';
}

function CopyControl({ label, text, color }: { label: string; text: string; color: string }) {
  const { status, copy } = useCopyAction();
  const share = () => {
    void Share.share({ message: text }).catch(() => {
      Alert.alert(
        'Could not share',
        'Sharing is not available right now. Try again, or copy this.',
      );
    });
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}>
      <PressableBox
        onPress={() => void copy(text)}
        accessibilityRole="button"
        accessibilityLabel={copyControlLabel(status, label)}
        style={{
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: spacing.sm,
        }}
      >
        <Text style={{ color, fontSize: typeScale.footnote }}>
          {copyControlLabel(status, label)}
        </Text>
      </PressableBox>
      <PressableBox
        onPress={share}
        accessibilityRole="button"
        accessibilityLabel="Share"
        style={{
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: spacing.sm,
        }}
      >
        <Text style={{ color, fontSize: typeScale.footnote }}>Share</Text>
      </PressableBox>
    </View>
  );
}

function EmailDraft({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'email' }>;
  colors: ColorScheme;
}) {
  const [to, setTo] = useState(fence.to);
  const [subject, setSubject] = useState(fence.subject);
  const [body, setBody] = useState(fence.body);
  const headers = [
    to ? `To: ${to}` : null,
    fence.cc ? `Cc: ${fence.cc}` : null,
    fence.bcc ? `Bcc: ${fence.bcc}` : null,
    subject ? `Subject: ${subject}` : null,
  ].filter((line): line is string => line !== null);
  const copyText = headers.length > 0 ? `${headers.join('\n')}\n\n${body}` : body;
  return (
    <View
      testID="answer-surface-email"
      accessibilityLabel="Email"
      style={{
        padding: spacing.xl,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.xl,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <TextInput
        accessibilityLabel="To"
        value={to}
        onChangeText={setTo}
        style={{
          ...chatTypography.writingSubject,
          color: colors.textPrimary,
          minHeight: 44,
          paddingVertical: spacing.sm,
        }}
      />
      {(
        [
          ['Cc', fence.cc],
          ['Bcc', fence.bcc],
        ] as const
      ).map(([label, value]) =>
        value ? (
          <Text
            key={label}
            selectable
            numberOfLines={3}
            style={{
              ...chatTypography.writingSubject,
              color: colors.textSecondary,
              maxWidth: '100%',
            }}
          >
            {`${label}: ${value}`}
          </Text>
        ) : null,
      )}
      <TextInput
        accessibilityLabel="Subject"
        value={subject}
        onChangeText={setSubject}
        style={{
          ...chatTypography.writingSubject,
          color: colors.textPrimary,
          minHeight: 44,
          paddingVertical: spacing.sm,
        }}
      />
      <TextInput
        accessibilityLabel="Message"
        value={body}
        onChangeText={setBody}
        editable
        multiline
        style={{
          ...chatTypography.body,
          color: colors.textPrimary,
          minHeight: 44,
          textAlignVertical: 'top',
        }}
      />
      <CopyControl label="Copy email" text={copyText} color={colors.textSecondary} />
      <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
        {PREVIEW_EDIT_NOTICE}
      </Text>
    </View>
  );
}

function WritingDraft({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'writing' }>;
  colors: ColorScheme;
}) {
  const [text, setText] = useState(fence.copyText);
  return (
    <View
      testID="answer-surface-writing"
      accessibilityLabel={fence.label}
      style={{
        padding: spacing.xl,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.xl,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Text style={{ ...chatTypography.writingSubject, color: colors.textSecondary }}>
        {fence.label}
      </Text>
      <TextInput
        accessibilityLabel={fence.label}
        value={text}
        onChangeText={setText}
        editable
        multiline
        style={{
          ...chatTypography.body,
          color: colors.textPrimary,
          minHeight: 44,
          textAlignVertical: 'top',
        }}
      />
      <CopyControl label="Copy draft" text={text} color={colors.textSecondary} />
      <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
        {PREVIEW_EDIT_NOTICE}
      </Text>
    </View>
  );
}

function stateTone(name: string): SurfaceTone {
  const state = name.toLowerCase();
  if (state === 'passed' || state === 'complete') return 'success';
  if (state === 'failed') return 'danger';
  if (state === 'pending' || state === 'in progress') return 'warning';
  return 'neutral';
}

function BodyText({ text, colors }: { text: string; colors: ColorScheme }) {
  return (
    <Text
      selectable
      style={{ color: colors.textPrimary, fontSize: typeScale.body, lineHeight: 22 }}
    >
      {text}
    </Text>
  );
}

function SecondaryText({ text, colors }: { text: string; colors: ColorScheme }) {
  return (
    <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 20 }}>
      {text}
    </Text>
  );
}

function RowDivider({ colors }: { colors: ColorScheme }) {
  return <View style={{ height: 1, backgroundColor: colors.borderLight }} />;
}

function CheckGroup({
  title,
  initial,
  colors,
  testID,
  summary,
}: {
  title: string;
  initial: { label: string; checked: boolean }[];
  colors: ColorScheme;
  testID: string;
  summary: 'progress' | 'states';
}) {
  const [items, setItems] = useState(initial);
  return (
    <SurfacePanel colors={colors} testID={testID} accessibilityLabel={title}>
      <PanelHeader title={title} aside={checklistProgress(items)} colors={colors} />
      <PanelSection colors={colors} gap={0}>
        {items.map((item, index) => (
          <ChoiceRow
            key={item.label}
            kind="checkbox"
            label={item.label}
            checked={item.checked}
            colors={colors}
            onPress={() =>
              setItems((current) =>
                current.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, checked: !row.checked } : row,
                ),
              )
            }
          />
        ))}
      </PanelSection>
      <PanelSection colors={colors} divided>
        {summary === 'states' ? (
          <SecondaryText
            text={items
              .map((item) => `${item.label}: ${item.checked ? 'Enabled' : 'Disabled'}`)
              .join('\n')}
            colors={colors}
          />
        ) : (
          <CopyControl
            label="Copy checklist"
            text={items.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.label}`).join('\n')}
            color={colors.textSecondary}
          />
        )}
      </PanelSection>
    </SurfacePanel>
  );
}

function RadioSurface({
  prompt,
  options,
  colors,
}: {
  prompt: string;
  options: { label: string; selected: boolean }[];
  colors: ColorScheme;
}) {
  const initial = options.find((option) => option.selected)?.label ?? options[0]?.label ?? '';
  const [selected, setSelected] = useState(initial);
  return (
    <SurfacePanel
      colors={colors}
      testID="answer-surface-radio"
      accessibilityLabel={prompt || 'Choices'}
    >
      {prompt ? <PanelHeader title={prompt} colors={colors} /> : null}
      <PanelSection colors={colors} gap={0}>
        <View accessibilityRole="radiogroup">
          {options.map((option) => (
            <ChoiceRow
              key={option.label}
              kind="radio"
              label={option.label}
              checked={selected === option.label}
              onPress={() => setSelected(option.label)}
              colors={colors}
            />
          ))}
        </View>
      </PanelSection>
      <PanelSection colors={colors} divided>
        <BodyText text={`Selected: ${selected}`} colors={colors} />
      </PanelSection>
    </SurfacePanel>
  );
}

function SliderSurface({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'slider' }>;
  colors: ColorScheme;
}) {
  const [value, setValue] = useState(fence.value);
  const shown = `${fence.prefix}${value}`;
  return (
    <SurfacePanel colors={colors} testID="answer-surface-slider" accessibilityLabel={fence.label}>
      <PanelSection colors={colors}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <Text style={{ flexShrink: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}>
            {fence.label}
          </Text>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.title3,
              fontWeight: '500',
              fontVariant: ['tabular-nums'],
            }}
          >
            {shown}
          </Text>
        </View>
        <SliderControl
          label={fence.label}
          min={fence.min}
          max={fence.max}
          value={value}
          onChange={setValue}
          colors={colors}
          valueText={shown}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <SecondaryText text={`${fence.prefix}${fence.min}`} colors={colors} />
          <SecondaryText text={`${fence.prefix}${fence.max}`} colors={colors} />
        </View>
      </PanelSection>
    </SurfacePanel>
  );
}

function DropdownSurface({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'dropdown' }>;
  colors: ColorScheme;
}) {
  const [selected, setSelected] = useState(fence.selected);
  return (
    <SurfacePanel colors={colors} testID="answer-surface-dropdown" accessibilityLabel={fence.label}>
      <PanelSection colors={colors}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '500' }}>
          {fence.label}
        </Text>
        <SelectControl
          label={fence.label}
          options={fence.options}
          value={selected}
          placeholder="Choose an option"
          onChange={setSelected}
          colors={colors}
        />
      </PanelSection>
      <PanelSection colors={colors} divided>
        <BodyText text={`Selected: ${selected}`} colors={colors} />
      </PanelSection>
    </SurfacePanel>
  );
}

function DetailsSurface({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'details' }>;
  colors: ColorScheme;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SurfacePanel
      colors={colors}
      testID="answer-surface-details"
      accessibilityLabel={fence.summary}
    >
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel={fence.summary}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.subhead,
            fontWeight: '500',
          }}
        >
          {fence.summary}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={colors.textSecondary} />
        </View>
      </PressableBox>
      {open ? (
        <PanelSection colors={colors} divided>
          <BodyText text={fence.detail} colors={colors} />
        </PanelSection>
      ) : null}
    </SurfacePanel>
  );
}

function CardsSurface({
  cards,
  colors,
}: {
  cards: { title: string; body: string }[];
  colors: ColorScheme;
}) {
  const { width } = useWindowDimensions();
  const twoColumns = width >= WIDE_LAYOUT_MIN_WIDTH;
  return (
    <View
      testID="answer-surface-cards"
      accessibilityLabel="Cards"
      style={{
        marginVertical: spacing.md,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
      }}
    >
      {cards.map((card) => (
        <View
          key={card.title}
          style={{
            width: twoColumns ? '48%' : '100%',
            gap: spacing.xs,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: colors.borderLight,
            borderRadius: radii.md,
          }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            {card.title}
          </Text>
          <SecondaryText text={card.body} colors={colors} />
        </View>
      ))}
    </View>
  );
}

function StatsSurface({
  spec,
  colors,
}: {
  spec: Extract<AssistantFence, { kind: 'stats' }>['spec'];
  colors: ColorScheme;
}) {
  return (
    <View
      testID="answer-surface-stats"
      accessibilityLabel={spec.title || 'Statistics'}
      style={{ marginVertical: spacing.md, gap: spacing.lg }}
    >
      {spec.title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
        >
          {spec.title}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl }}>
        {spec.items.map((item, index) => (
          <View
            key={`${index}-${item.label}`}
            accessible
            accessibilityLabel={[item.label, item.value, item.caption, item.tag]
              .filter(Boolean)
              .join(', ')}
            style={{ width: '50%', paddingRight: spacing.lg, gap: 2 }}
          >
            <SecondaryText text={item.label} colors={colors} />
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: typeScale.title2,
                fontWeight: '500',
                fontVariant: ['tabular-nums'],
              }}
            >
              {item.value}
            </Text>
            {item.caption ? <SecondaryText text={item.caption} colors={colors} /> : null}
            {item.tag ? <SecondaryText text={item.tag} colors={colors} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function CardSurface({
  spec,
  colors,
  renderBody,
}: {
  spec: Extract<AssistantFence, { kind: 'card' }>['spec'];
  colors: ColorScheme;
  renderBody?: (text: string) => ReactNode;
}) {
  return (
    <SurfacePanel colors={colors} testID="answer-surface-card" accessibilityLabel={spec.title}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xs }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
        >
          {spec.title}
        </Text>
        {spec.subtitle ? <SecondaryText text={spec.subtitle} colors={colors} /> : null}
        {spec.tags.length > 0 ? (
          <View
            accessibilityLabel="Tags"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginTop: spacing.xs,
            }}
          >
            {spec.tags.map((tag, index) => (
              <View
                key={`${index}-${tag}`}
                style={{
                  borderRadius: radii.sm,
                  backgroundColor: colors.surfaceHover,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View
        style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
      >
        {renderBody ? renderBody(spec.body) : <BodyText text={spec.body} colors={colors} />}
      </View>
    </SurfacePanel>
  );
}

function chartFromFence(fence: Extract<AssistantFence, { kind: 'chart' }>) {
  return {
    kind: 'xy' as const,
    ...(fence.title ? { title: fence.title } : {}),
    categories: fence.points.map((point) => point.label),
    ...(fence.yLabel ? { yLabel: fence.yLabel } : {}),
    series: [
      {
        type: 'bar' as const,
        ...(fence.yLabel ? { name: fence.yLabel } : {}),
        values: fence.points.map((point) => point.value),
      },
    ],
  };
}

function LinkText({ href, colors }: { href: string; colors: ColorScheme }) {
  return (
    <PressableBox
      accessibilityRole="link"
      accessibilityLabel={`Open ${href}`}
      onPress={() => void openUntrustedUrlInAppBrowser(href)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
    >
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          color: colors.teal,
          fontSize: typeScale.footnote,
          textDecorationLine: 'underline',
        }}
      >
        {href}
      </Text>
      <ArrowUpRight size={14} color={colors.teal} />
    </PressableBox>
  );
}

export function AssistantSurface({
  fence,
  colors,
  onFollowUp,
  streaming = false,
  renderBody,
}: {
  fence: MobileAssistantFence;
  colors: ColorScheme;
  onFollowUp?: (text: string) => void;
  streaming?: boolean;
  renderBody?: (text: string) => ReactNode;
}) {
  if (fence.kind === 'fallback') {
    return (
      <Text testID="answer-fallback" selectable style={{ color: colors.textPrimary }}>
        {fence.text}
      </Text>
    );
  }
  if (fence.kind === 'email') {
    return <EmailDraft key={fence.copyText} fence={fence} colors={colors} />;
  }
  if (fence.kind === 'writing') {
    return <WritingDraft key={fence.copyText} fence={fence} colors={colors} />;
  }
  if (fence.kind === 'form') {
    return (
      <AnswerFormSurface
        key={fence.source}
        spec={fence.spec}
        colors={colors}
        streaming={streaming}
        {...(onFollowUp ? { onFollowUp } : {})}
      />
    );
  }
  if (fence.kind === 'carousel') {
    return <CarouselSurface spec={fence.spec} colors={colors} />;
  }
  if (fence.kind === 'card') {
    return (
      <CardSurface spec={fence.spec} colors={colors} {...(renderBody ? { renderBody } : {})} />
    );
  }
  if (fence.kind === 'stats') {
    return <StatsSurface spec={fence.spec} colors={colors} />;
  }
  if (fence.kind === 'copy') {
    const label =
      fence.surface === 'prompt'
        ? 'Copy full prompt'
        : fence.surface === 'commands'
          ? 'Copy commands'
          : 'Copy';
    return (
      <SurfacePanel
        colors={colors}
        testID={`answer-surface-${fence.surface}`}
        accessibilityLabel={fence.title}
      >
        <PanelHeader title={fence.title} colors={colors} />
        <PanelSection colors={colors}>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontFamily: 'Menlo',
              fontSize: typeScale.footnote,
              lineHeight: 20,
            }}
          >
            {fence.copyText}
          </Text>
        </PanelSection>
        <PanelSection colors={colors} divided>
          <CopyControl label={label} text={fence.copyText} color={colors.textSecondary} />
          {fence.notice ? <SecondaryText text={fence.notice} colors={colors} /> : null}
        </PanelSection>
      </SurfacePanel>
    );
  }
  if (fence.kind === 'cards') {
    return <CardsSurface cards={fence.cards} colors={colors} />;
  }
  if (fence.kind === 'checklist') {
    return (
      <CheckGroup
        key={fence.title}
        title={fence.title}
        initial={fence.items}
        colors={colors}
        testID="answer-surface-checklist"
        summary="progress"
      />
    );
  }
  if (fence.kind === 'checks') {
    return (
      <CheckGroup
        key={fence.title}
        title={fence.title}
        initial={fence.items}
        colors={colors}
        testID="answer-surface-checks"
        summary="states"
      />
    );
  }
  if (fence.kind === 'chart') {
    return (
      <View testID="answer-surface-chart" style={{ marginVertical: spacing.md }}>
        <ReportChart chart={chartFromFence(fence)} colors={colors} />
      </View>
    );
  }
  if (fence.kind === 'citation') {
    return (
      <SurfacePanel
        colors={colors}
        testID="answer-surface-citation"
        accessibilityLabel={fence.title}
      >
        <PanelSection colors={colors} gap={spacing.xs}>
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            {fence.title}
          </Text>
          {fence.source ? <SecondaryText text={fence.source} colors={colors} /> : null}
          {fence.summary ? <BodyText text={fence.summary} colors={colors} /> : null}
          <LinkText href={fence.href} colors={colors} />
        </PanelSection>
      </SurfacePanel>
    );
  }
  if (fence.kind === 'status') {
    return (
      <SurfacePanel colors={colors} testID="answer-surface-status" accessibilityLabel="Status">
        {fence.rows.map((row, index) => (
          <View key={row.label}>
            {index > 0 ? <RowDivider colors={colors} /> : null}
            <View
              accessible
              accessibilityLabel={`${row.label}: ${row.name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                {row.label}
              </Text>
              <StatusPill label={row.name} tone={stateTone(row.name)} colors={colors} />
            </View>
          </View>
        ))}
      </SurfacePanel>
    );
  }
  if (fence.kind === 'radio') {
    return <RadioSurface prompt={fence.prompt} options={fence.options} colors={colors} />;
  }
  if (fence.kind === 'slider') {
    return <SliderSurface key={`${fence.label}-${fence.value}`} fence={fence} colors={colors} />;
  }
  if (fence.kind === 'dropdown') {
    return (
      <DropdownSurface key={`${fence.label}-${fence.selected}`} fence={fence} colors={colors} />
    );
  }
  if (fence.kind === 'gallery') {
    return <GallerySurface items={fence.items} colors={colors} />;
  }
  if (fence.kind === 'details') {
    return <DetailsSurface fence={fence} colors={colors} />;
  }
  if (fence.kind === 'map') {
    return (
      <SurfacePanel colors={colors} testID="answer-surface-map" accessibilityLabel="Map">
        <PanelHeader title="Places" colors={colors} />
        <PanelSection colors={colors}>
          {fence.stops.map((stop, index) => (
            <View key={stop.name} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {`${index + 1}.`}
              </Text>
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                <Text style={{ fontWeight: '600' }}>{stop.name}</Text>
                {stop.note ? (
                  <Text style={{ color: colors.textSecondary }}>{`: ${stop.note}`}</Text>
                ) : null}
              </Text>
            </View>
          ))}
        </PanelSection>
        <PanelSection colors={colors} divided>
          <SecondaryText
            text="Place names are listed. A map image is not loaded in this view."
            colors={colors}
          />
        </PanelSection>
      </SurfacePanel>
    );
  }
  if (fence.kind === 'actions') {
    return (
      <View
        testID="answer-surface-actions"
        accessibilityLabel="Actions"
        style={{ marginVertical: spacing.sm }}
      >
        {fence.items.map((item) => (
          <CopyControl
            key={item.label}
            label={item.label}
            text={item.text}
            color={colors.textSecondary}
          />
        ))}
      </View>
    );
  }
  if (fence.kind === 'files') {
    return (
      <SurfacePanel colors={colors} testID="answer-surface-files" accessibilityLabel="Files">
        {fence.files.map((file, index) => (
          <View key={file.name}>
            {index > 0 ? <RowDivider colors={colors} /> : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '500' }}
                >
                  {file.name}
                </Text>
                {file.note ? <SecondaryText text={file.note} colors={colors} /> : null}
              </View>
              <StatusPill label={file.kind.toUpperCase()} tone="neutral" colors={colors} />
            </View>
          </View>
        ))}
      </SurfacePanel>
    );
  }
  if (fence.kind === 'transcript') {
    return (
      <SurfacePanel
        colors={colors}
        testID="answer-surface-transcript"
        accessibilityLabel="Transcript"
      >
        <PanelHeader title="Transcript" colors={colors} />
        <PanelSection colors={colors} gap={spacing.md}>
          {fence.lines.map((line) => (
            <View key={`${line.time}-${line.speaker}`} style={{ gap: 2 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                {line.time} <Text style={{ fontWeight: '600' }}>{line.speaker}</Text>
              </Text>
              <BodyText text={line.text} colors={colors} />
            </View>
          ))}
        </PanelSection>
        <PanelSection colors={colors} divided>
          <SecondaryText text="This is a transcript layout, not an audio player." colors={colors} />
        </PanelSection>
      </SurfacePanel>
    );
  }
  if (fence.kind === 'timeline') {
    return (
      <SurfacePanel colors={colors} testID="answer-surface-timeline" accessibilityLabel="Timeline">
        <PanelSection colors={colors} gap={spacing.md}>
          {fence.steps.map((step, index) => (
            <View
              key={step.title}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                >
                  {`${index + 1}. ${step.title}`}
                </Text>
                {step.detail ? <SecondaryText text={step.detail} colors={colors} /> : null}
              </View>
              <StatusPill label={step.name} tone={stateTone(step.name)} colors={colors} />
            </View>
          ))}
        </PanelSection>
      </SurfacePanel>
    );
  }
  if (fence.kind === 'followups') {
    return (
      <SurfacePanel
        colors={colors}
        testID="answer-surface-followups"
        accessibilityLabel="Follow-ups"
      >
        {fence.items.map((item, index) => (
          <View key={item}>
            {index > 0 ? <RowDivider colors={colors} /> : null}
            {onFollowUp ? (
              <PressableBox
                accessibilityRole="button"
                accessibilityLabel={item}
                onPress={() => onFollowUp(item)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
              >
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                  {item}
                </Text>
                <ArrowUpRight size={16} color={colors.textSecondary} />
              </PressableBox>
            ) : (
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <BodyText text={item} colors={colors} />
              </View>
            )}
          </View>
        ))}
      </SurfacePanel>
    );
  }
  return (
    <SurfacePanel
      colors={colors}
      testID="answer-surface-tool"
      accessibilityLabel={`Tool result ${fence.stateLabel}`}
    >
      <PanelHeader
        title={fence.name}
        aside={
          <StatusPill label={fence.stateLabel} tone={stateTone(fence.stateLabel)} colors={colors} />
        }
        colors={colors}
      />
      {fence.output ? (
        <PanelSection colors={colors}>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontFamily: 'Menlo',
              fontSize: typeScale.footnote,
              lineHeight: 20,
            }}
          >
            {fence.output}
          </Text>
        </PanelSection>
      ) : null}
    </SurfacePanel>
  );
}
