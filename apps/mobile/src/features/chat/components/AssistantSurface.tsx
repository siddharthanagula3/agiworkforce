import { useState } from 'react';
import { Alert, Share, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import type { ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { checklistProgress, type AssistantFence } from '@agiworkforce/unified-chat/assistant-fence';

type MobileAssistantFence = Exclude<
  AssistantFence,
  { kind: 'code' | 'card' | 'stats' | 'form' | 'carousel' }
>;

export function canRenderAssistantSurface(fence: AssistantFence): fence is MobileAssistantFence {
  return (
    fence.kind !== 'code' &&
    fence.kind !== 'card' &&
    fence.kind !== 'stats' &&
    fence.kind !== 'form' &&
    fence.kind !== 'carousel'
  );
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <PressableBox
        onPress={() => void copy(text)}
        accessibilityRole="button"
        accessibilityLabel={copyControlLabel(status, label)}
      >
        <Text style={{ color, fontSize: typeScale.footnote }}>
          {copyControlLabel(status, label)}
        </Text>
      </PressableBox>
      <PressableBox onPress={share} accessibilityRole="button" accessibilityLabel="Share">
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
  const copyText = [to ? `To: ${to}` : null, subject ? `Subject: ${subject}` : null, '', body]
    .filter((line): line is string => line !== null)
    .join('\n');
  return (
    <View testID="answer-surface-email" accessibilityLabel="Email">
      <TextInput
        accessibilityLabel="To"
        value={to}
        onChangeText={setTo}
        style={{ color: colors.textPrimary }}
      />
      <TextInput
        accessibilityLabel="Subject"
        value={subject}
        onChangeText={setSubject}
        style={{ color: colors.textPrimary }}
      />
      <TextInput
        accessibilityLabel="Message"
        value={body}
        onChangeText={setBody}
        editable
        multiline
        style={{ color: colors.textPrimary }}
      />
      <CopyControl label="Copy email" text={copyText} color={colors.textSecondary} />
    </View>
  );
}

function RadioChoices({
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
    <View testID="answer-surface-radio" accessibilityLabel={prompt || 'Choices'}>
      {prompt ? (
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{prompt}</Text>
      ) : null}
      {options.map((option) => (
        <PressableBox
          key={option.label}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === option.label }}
          accessibilityLabel={option.label}
          onPress={() => setSelected(option.label)}
        >
          <Text style={{ color: colors.textPrimary }}>
            {option.label}
            {selected === option.label ? ' (selected)' : ''}
          </Text>
        </PressableBox>
      ))}
    </View>
  );
}

function Checklist({
  fence,
  colors,
}: {
  fence: Extract<AssistantFence, { kind: 'checklist' }>;
  colors: ColorScheme;
}) {
  const [items, setItems] = useState(fence.items);
  return (
    <View testID="answer-surface-checklist" accessibilityLabel={fence.title}>
      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.title}</Text>
      <Text accessibilityRole="text">{checklistProgress(items)}</Text>
      {items.map((item, index) => (
        <PressableBox
          key={item.label}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.label}
          onPress={() =>
            setItems((current) =>
              current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, checked: !row.checked } : row,
              ),
            )
          }
        >
          <Text style={{ color: colors.textPrimary }}>
            {item.checked ? '[x]' : '[ ]'} {item.label}
          </Text>
        </PressableBox>
      ))}
    </View>
  );
}

export function AssistantSurface({
  fence,
  colors,
  onFollowUp,
}: {
  fence: MobileAssistantFence;
  colors: ColorScheme;
  onFollowUp?: (text: string) => void;
}) {
  if (fence.kind === 'fallback') {
    return (
      <Text testID="answer-fallback" style={{ color: colors.textPrimary }}>
        {fence.text}
      </Text>
    );
  }
  if (fence.kind === 'email') {
    return <EmailDraft fence={fence} colors={colors} />;
  }
  if (fence.kind === 'writing') {
    return (
      <View testID="answer-surface-writing" accessibilityLabel={fence.label}>
        <Text style={{ color: colors.textPrimary }}>{fence.label}</Text>
        <TextInput
          accessibilityLabel={fence.label}
          defaultValue={fence.copyText}
          editable
          multiline
          style={{ color: colors.textPrimary }}
        />
        <CopyControl label="Copy draft" text={fence.copyText} color={colors.textSecondary} />
      </View>
    );
  }
  if (fence.kind === 'copy') {
    const label =
      fence.surface === 'prompt'
        ? 'Copy full prompt'
        : fence.surface === 'commands'
          ? 'Copy commands'
          : 'Copy';
    return (
      <View testID={`answer-surface-${fence.surface}`} accessibilityLabel={fence.title}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.title}</Text>
        <Text style={{ color: colors.textPrimary }}>{fence.copyText}</Text>
        {fence.notice ? <Text style={{ color: colors.textSecondary }}>{fence.notice}</Text> : null}
        <CopyControl label={label} text={fence.copyText} color={colors.textSecondary} />
      </View>
    );
  }
  if (fence.kind === 'cards') {
    return (
      <View testID="answer-surface-cards" accessibilityLabel="Cards">
        {fence.cards.map((card) => (
          <View key={card.title}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{card.title}</Text>
            <Text style={{ color: colors.textSecondary }}>{card.body}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (fence.kind === 'checklist') {
    return <Checklist fence={fence} colors={colors} />;
  }
  if (fence.kind === 'chart') {
    const peak = Math.max(...fence.points.map((point) => point.value), 1);
    return (
      <View testID="answer-surface-chart" accessibilityLabel={fence.title || 'Chart'}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
          {fence.title || 'Chart'}
        </Text>
        {fence.points.map((point) => (
          <View key={point.label}>
            <View
              accessibilityLabel={`${point.label} ${point.value}`}
              style={{
                height: 8,
                width: `${Math.max(8, (point.value / peak) * 100)}%`,
                backgroundColor: colors.textSecondary,
              }}
            />
            <Text style={{ color: colors.textPrimary }}>
              {point.label} {point.value}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  if (fence.kind === 'citation') {
    return (
      <View testID="answer-surface-citation" accessibilityLabel={fence.title}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.title}</Text>
        <Text style={{ color: colors.textSecondary }}>{fence.source}</Text>
        <Text style={{ color: colors.textPrimary }}>{fence.summary}</Text>
        <Text style={{ color: colors.textSecondary }}>{fence.href}</Text>
      </View>
    );
  }
  if (fence.kind === 'status') {
    return (
      <View testID="answer-surface-status" accessibilityLabel="Status">
        {fence.rows.map((row) => (
          <Text key={row.label} style={{ color: colors.textPrimary }}>
            {row.label}: {row.name}
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'radio') {
    return <RadioChoices prompt={fence.prompt} options={fence.options} colors={colors} />;
  }
  if (fence.kind === 'slider') {
    return (
      <View testID="answer-surface-slider" accessibilityLabel={fence.label}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.label}</Text>
        <Text style={{ color: colors.textPrimary }}>
          {fence.prefix}
          {fence.value} ({fence.min} to {fence.max})
        </Text>
      </View>
    );
  }
  if (fence.kind === 'checks') {
    return (
      <View testID="answer-surface-checks" accessibilityLabel={fence.title}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.title}</Text>
        {fence.items.map((item) => (
          <Text key={item.label} style={{ color: colors.textPrimary }}>
            {item.label}: {item.checked ? 'Enabled' : 'Disabled'}
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'dropdown') {
    return (
      <View testID="answer-surface-dropdown" accessibilityLabel={fence.label}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.label}</Text>
        {fence.options.map((option) => (
          <Text key={option} style={{ color: colors.textPrimary }}>
            {option}
            {option === fence.selected ? ' (selected)' : ''}
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'gallery') {
    return (
      <View testID="answer-surface-gallery" accessibilityLabel="Gallery">
        {fence.items.map((item) => (
          <Text key={item.caption} style={{ color: colors.textPrimary }}>
            {item.caption}
            {item.color ? ` ${item.color}` : ''}
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'details') {
    return (
      <View testID="answer-surface-details" accessibilityLabel={fence.summary}>
        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.summary}</Text>
        <Text style={{ color: colors.textPrimary }}>{fence.detail}</Text>
      </View>
    );
  }
  if (fence.kind === 'map') {
    return (
      <View testID="answer-surface-map" accessibilityLabel="Map">
        {fence.stops.map((stop) => (
          <Text key={stop.name} style={{ color: colors.textPrimary }}>
            {stop.name}
            {stop.note ? `: ${stop.note}` : ''}
          </Text>
        ))}
        <Text style={{ color: colors.textSecondary }}>
          Place names are listed. A map image is not loaded in this view.
        </Text>
      </View>
    );
  }
  if (fence.kind === 'actions') {
    return (
      <View testID="answer-surface-actions" accessibilityLabel="Actions">
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
      <View testID="answer-surface-files" accessibilityLabel="Files">
        {fence.files.map((file) => (
          <Text key={file.name} style={{ color: colors.textPrimary }}>
            {file.name} ({file.kind}){file.note ? `: ${file.note}` : ''}
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'transcript') {
    return (
      <View testID="answer-surface-transcript" accessibilityLabel="Transcript">
        {fence.lines.map((line) => (
          <Text key={`${line.time}-${line.speaker}`} style={{ color: colors.textPrimary }}>
            {line.time} {line.speaker}: {line.text}
          </Text>
        ))}
        <Text style={{ color: colors.textSecondary }}>
          This is a transcript layout, not an audio player.
        </Text>
      </View>
    );
  }
  if (fence.kind === 'timeline') {
    return (
      <View testID="answer-surface-timeline" accessibilityLabel="Timeline">
        {fence.steps.map((step, index) => (
          <Text key={step.title} style={{ color: colors.textPrimary }}>
            {index + 1}. {step.title}
            {step.detail ? `: ${step.detail}` : ''} ({step.name})
          </Text>
        ))}
      </View>
    );
  }
  if (fence.kind === 'followups') {
    return (
      <View testID="answer-surface-followups" accessibilityLabel="Follow-ups">
        {fence.items.map((item) =>
          onFollowUp ? (
            <PressableBox
              key={item}
              accessibilityRole="button"
              accessibilityLabel={item}
              onPress={() => onFollowUp(item)}
            >
              <Text style={{ color: colors.textPrimary }}>{item}</Text>
            </PressableBox>
          ) : (
            <Text key={item} style={{ color: colors.textPrimary }}>
              {item}
            </Text>
          ),
        )}
      </View>
    );
  }
  return (
    <View testID="answer-surface-tool" accessibilityLabel={`Tool result ${fence.stateLabel}`}>
      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{fence.name}</Text>
      <Text style={{ color: colors.textPrimary }}>{fence.stateLabel}</Text>
      {fence.output ? <Text style={{ color: colors.textPrimary }}>{fence.output}</Text> : null}
    </View>
  );
}
