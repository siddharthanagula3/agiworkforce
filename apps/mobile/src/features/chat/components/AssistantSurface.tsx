import { useState, type ReactNode } from 'react';
import { Alert, Share, View, useWindowDimensions } from 'react-native';
import { ArrowUpRight, ChevronDown } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import type { ColorScheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { checklistProgress, type AssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import { parseEmailBlock } from '@agiworkforce/unified-chat/rich-blocks';
import { AssistantDraftScope, useAssistantDraftScope } from './AssistantDraftScope';
import { EmailDraftSurface, WritingDraftSurface } from './DraftSurfaces';
import { AnswerFormSurface } from './AnswerFormSurface';
import { MapFenceSurface } from './MapFenceSurface';
import { CarouselSurface, GallerySurface } from './AnswerMediaSurfaces';
import { openAssistantLink } from './MarkdownInline';
import { followUpChipText } from '@/src/features/chat/utils/followUpChipText';
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
import { chartFromAssistantFence } from '@/src/features/chat/utils/chartArtifact';

type MobileAssistantFence = Exclude<AssistantFence, { kind: 'code' }>;

const WIDE_LAYOUT_MIN_WIDTH = 600;
const THREE_COLUMN_MIN_WIDTH = 900;

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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {items.some((item, index) => item.checked !== initial[index]?.checked) ? (
              <PressableBox
                onPress={() => setItems(initial)}
                accessibilityRole="button"
                accessibilityLabel="Reset"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.sm,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                  Reset
                </Text>
              </PressableBox>
            ) : null}
            <CopyControl
              label="Copy checklist"
              text={items.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.label}`).join('\n')}
              color={colors.textSecondary}
            />
          </View>
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

function cardWidth(columns: 1 | 2 | 3, windowWidth: number): '100%' | '48%' | '31%' {
  if (columns === 3 && windowWidth >= THREE_COLUMN_MIN_WIDTH) return '31%';
  if (columns > 1 && windowWidth >= WIDE_LAYOUT_MIN_WIDTH) return '48%';
  return '100%';
}

function CardsSurface({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'cards' }>;
  colors: ColorScheme;
}) {
  const { width } = useWindowDimensions();
  const columnWidth = cardWidth(fence.columns, width);
  const modes = fence.note !== '';
  return (
    <View
      testID="answer-surface-cards"
      accessibilityLabel={fence.title || (modes ? 'Display modes' : 'Cards')}
      style={{ marginVertical: spacing.md, gap: spacing.md }}
    >
      {fence.title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {fence.title}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {fence.cards.map((card) => (
          <CardTile key={card.title} card={card} width={columnWidth} colors={colors} />
        ))}
      </View>
      {modes ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
            paddingTop: spacing.md,
          }}
        >
          <SecondaryText text={fence.note} colors={colors} />
        </View>
      ) : null}
    </View>
  );
}

function CardTile({
  card,
  width,
  colors,
}: {
  card: { title: string; body: string };
  width: '100%' | '48%' | '31%';
  colors: ColorScheme;
}) {
  return (
    <View
      style={{
        width,
        gap: spacing.xs,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: radii.md,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}>
        {card.title}
      </Text>
      <SecondaryText text={card.body} colors={colors} />
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

function LinkText({ href, colors }: { href: string; colors: ColorScheme }) {
  return (
    <PressableBox
      accessibilityRole="link"
      accessibilityLabel={`Open ${href}`}
      onPress={() => openAssistantLink(href)}
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

const STOPPED_SURFACE_CAPTION = 'Stopped before it finished';

export function AssistantSurface({
  stopped = false,
  ...surface
}: {
  fence: MobileAssistantFence;
  colors: ColorScheme;
  onFollowUp?: (text: string) => void;
  streaming?: boolean;
  stopped?: boolean;
  renderBody?: (text: string) => ReactNode;
}) {
  const scope = useAssistantDraftScope();
  const { fence, colors } = surface;
  const body = <AssistantSurfaceBody {...surface} />;
  if (!stopped || fence.kind === 'fallback') return body;
  const persistable = fence.kind !== 'email' || parseEmailBlock(fence.copyText) !== null;
  return (
    <View>
      {scope && !persistable ? (
        <AssistantDraftScope messageId={scope.messageId}>{body}</AssistantDraftScope>
      ) : (
        body
      )}
      <Text
        testID="answer-surface-stopped"
        style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
      >
        {STOPPED_SURFACE_CAPTION}
      </Text>
    </View>
  );
}

function AssistantSurfaceBody({
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
  const scope = useAssistantDraftScope();
  const streamingEmail =
    streaming && fence.kind === 'fallback' && fence.language === 'email'
      ? parseEmailBlock(fence.text, true)
      : null;
  if (streamingEmail) {
    return (
      <EmailDraftSurface
        draft={streamingEmail.draft}
        identity={fence.kind === 'fallback' ? fence.text : ''}
        colors={colors}
        streaming
      />
    );
  }
  if (fence.kind === 'fallback') {
    return (
      <Text testID="answer-fallback" selectable style={{ color: colors.textPrimary }}>
        {fence.text}
      </Text>
    );
  }
  if (fence.kind === 'email') {
    return (
      <EmailDraftSurface
        key={scope ? undefined : fence.copyText}
        draft={fence}
        identity={fence.copyText}
        colors={colors}
        streaming={streaming}
      />
    );
  }
  if (fence.kind === 'writing' || (fence.kind === 'copy' && fence.surface === 'prompt')) {
    const prompt = fence.kind === 'copy';
    return (
      <WritingDraftSurface
        key={scope ? undefined : fence.copyText}
        language={prompt ? 'prompt' : fence.language}
        label={prompt ? fence.title : fence.label}
        copyLabel={prompt ? 'Copy full prompt' : 'Copy draft'}
        source={fence.copyText}
        colors={colors}
        streaming={streaming}
        {...(renderBody ? { renderBody } : {})}
      />
    );
  }
  if (fence.kind === 'form') {
    return (
      <AnswerFormSurface
        key={fence.source}
        source={fence.source}
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
    const label = fence.surface === 'commands' ? 'Copy commands' : 'Copy';
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
              fontFamily: codeFontFamily,
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
    return <CardsSurface fence={fence} colors={colors} />;
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
        <ReportChart chart={chartFromAssistantFence(fence)} colors={colors} />
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
    return <MapFenceSurface stops={fence.stops} colors={colors} streaming={streaming} />;
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
                {step.date ? (
                  <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                    {step.date}
                  </Text>
                ) : null}
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
                accessibilityLabel={followUpChipText(item)}
                accessibilityState={{ disabled: streaming }}
                disabled={streaming}
                onPress={() => onFollowUp(followUpChipText(item))}
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
                  {followUpChipText(item)}
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
              fontFamily: codeFontFamily,
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
