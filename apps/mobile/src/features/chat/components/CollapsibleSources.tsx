import { useCallback, useState } from 'react';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLink, Search, X } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  canOpenSource,
  openSource,
  sourceInitial,
  sourcePublisher,
  sourceSnippet,
} from '@/src/features/chat/utils/sourceDisplay';
import { formatSourcePublishedDate } from '@/src/features/chat/utils/sourcePublishedDate';
import type { MessageSource } from '@/src/features/chat/utils/messageSources';
import { hasMessageStreamError } from '@/src/features/chat/utils/messageStreamError';
import { translatePlural } from '@/src/i18n/plural';

interface CollapsibleSourcesProps {
  sources: readonly MessageSource[];
  citedCount?: number;
  query?: string;
  partial?: boolean;
  metadata?: Record<string, unknown>;
}

const STOPPED_FINISH_REASONS = new Set(['stopped', 'cancelled', 'canceled']);

function endedBeforeCompletion(metadata: Record<string, unknown> | undefined): boolean {
  const finishReason = metadata?.['finishReason'];
  if (typeof finishReason === 'string' && STOPPED_FINISH_REASONS.has(finishReason)) return true;
  return hasMessageStreamError({ metadata });
}

const STACKED_MARKS = 3;
const MARK_SIZE = 22;
const MARK_OVERLAP = 8;
const PILL_PADDING_VERTICAL = 5;
const PILL_HIT_SLOP = { top: 6, bottom: 6 };
const CLOSE_TARGET = 44;

// A site's own icon would be fetched from a third party the moment an answer
// appears, which the app does not do for remote images without the person
// asking, so a source is marked by the first letter of its site instead.
function SourceMark({ source, overlap }: { source: MessageSource; overlap: boolean }) {
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const size = Math.round(MARK_SIZE * fontScale);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.full,
        marginLeft: overlap ? -Math.round(MARK_OVERLAP * fontScale) : 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSurface,
        borderWidth: 1.5,
        borderColor: colors.inputSurface,
      }}
    >
      <Text style={{ fontSize: typeScale.caption, fontWeight: '700', color: colors.teal }}>
        {sourceInitial(source)}
      </Text>
    </View>
  );
}

function SectionHeading({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: typeScale.footnote,
        fontWeight: '600',
        color: colors.textSecondary,
        paddingHorizontal: 8,
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      {label}
    </Text>
  );
}

function SourceRow({ source, number }: { source: MessageSource; number: number }) {
  const colors = useThemeColors();
  const publisher = sourcePublisher(source);
  const published = formatSourcePublishedDate(source.publishedDate);
  const snippet = sourceSnippet(source);
  const canOpen = canOpenSource(source.url);
  return (
    <PressableBox
      onPress={canOpen ? () => void openSource(source.url) : undefined}
      disabled={!canOpen}
      accessibilityLabel={`Source ${number}: ${source.title || publisher}`}
      accessibilityRole={canOpen ? 'link' : 'text'}
      accessibilityHint={canOpen ? 'Opens in the in-app browser' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        minHeight: CLOSE_TARGET,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      <SourceMark source={source} overlap={false} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {published ? `${publisher} · ${published}` : publisher}
        </Text>
        {source.title ? (
          <Text
            numberOfLines={2}
            style={{ fontSize: typeScale.callout, color: colors.textPrimary }}
          >
            {source.title}
          </Text>
        ) : null}
        {snippet ? (
          <Text
            numberOfLines={3}
            style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
          >
            {snippet}
          </Text>
        ) : null}
      </View>
      {canOpen ? (
        <ExternalLink size={14} color={colors.textMuted} style={{ marginTop: 3 }} />
      ) : null}
    </PressableBox>
  );
}

export function CollapsibleSources({
  sources,
  citedCount,
  query,
  partial: partialProp = false,
  metadata,
}: CollapsibleSourcesProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (sources.length === 0) return null;

  const cited = citedCount === undefined ? 0 : Math.min(Math.max(citedCount, 0), sources.length);
  const sectioned = citedCount !== undefined;
  const partial = partialProp || endedBeforeCompletion(metadata);
  const title = partial ? 'Sources so far' : 'Sources';

  return (
    <>
      <PressableBox
        testID="chat.sources"
        onPress={() => setOpen(true)}
        hitSlop={PILL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={
          partial
            ? translatePlural('chat', 'counts.viewSourcesSoFar', sources.length, {
                one: 'View {{count}} source so far',
                other: 'View {{count}} sources so far',
              })
            : translatePlural('chat', 'counts.viewSources', sources.length, {
                one: 'View {{count}} source',
                other: 'View {{count}} sources',
              })
        }
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          paddingVertical: PILL_PADDING_VERTICAL,
          paddingLeft: 6,
          paddingRight: 12,
          borderRadius: radii.full,
          backgroundColor: pressed ? colors.surfaceHover : colors.inputSurface,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {sources.slice(0, STACKED_MARKS).map((source, index) => (
            <SourceMark key={`${index}-${source.url}`} source={source} overlap={index > 0} />
          ))}
        </View>
        <Text
          style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
        >
          {title}
        </Text>
      </PressableBox>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 16,
              paddingRight: 4,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
            >
              {title}
            </Text>
            <PressableBox
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: CLOSE_TARGET,
                height: CLOSE_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            {query ? (
              <View
                testID="chat.sources.query"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                <Search size={14} color={colors.textMuted} />
                <Text
                  numberOfLines={2}
                  style={{ flex: 1, fontSize: typeScale.footnote, color: colors.textSecondary }}
                >
                  {query}
                </Text>
              </View>
            ) : null}
            {sectioned && cited > 0 ? <SectionHeading label="Citations" /> : null}
            {sources.slice(0, sectioned ? cited : sources.length).map((source, index) => (
              <SourceRow key={`source-${index}`} source={source} number={index + 1} />
            ))}
            {sectioned && cited < sources.length ? (
              <>
                <SectionHeading label="More" />
                {sources.slice(cited).map((source, index) => (
                  <SourceRow
                    key={`source-${cited + index}`}
                    source={source}
                    number={cited + index + 1}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
