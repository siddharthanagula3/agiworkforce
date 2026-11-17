import { Alert, Linking, Platform, Share, View, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import {
  findCitationIndexForUrl,
  isCitationOnlyLinkText,
} from '@agiworkforce/unified-chat/citation-markers';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { MathBlock } from './MathBlock';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { resolveAnswerLink } from '@/src/features/chat/utils/answerLinks';
import {
  getSystemIntentPrompt,
  linkDisplayText,
  linkOpenTarget,
  systemIntentTarget,
} from '@/src/features/chat/utils/externalUrls';
import {
  footnoteMarker,
  footnoteNumber,
  inlineNodesText,
  inlinePlainText,
  parseInlineMarkdown,
  restoreEscapes,
  type InlineNode,
  type InlineStyleName,
  type LinkDefinitions,
} from '@/src/features/chat/utils/markdownInlineSyntax';
import { openSource, sourcePublisher } from '@/src/features/chat/utils/sourceDisplay';
import { showToast } from '@/src/shared/components/Toast';
import { showActionMenu } from '@/src/shared/components/ActionMenuHost';
import { COPIED_LABEL, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import type { ConversationMenuAction } from '@/src/features/conversation-actions/useConversationActions';
import { canPreviewCitation, previewCitation, type CitationSource } from './CitationChip';
import { InlineMarkdownImage, type InlineImageConsent } from './MarkdownImage';
import { splitInlineImages, type ParagraphPiece } from './markdownBlockSyntax';

export {
  footnoteMarker,
  protectEscapes,
  restoreEscapes,
} from '@/src/features/chat/utils/markdownInlineSyntax';

export type InlineFootnotes = Readonly<Record<string, string>>;

export interface InlineRenderOptions {
  readonly onFootnotePress?: (label: string) => void;
  readonly linkDefinitions?: LinkDefinitions;
  readonly linkifyNumericCitations?: boolean;
  readonly trustedImageKeys?: ReadonlySet<string>;
}

const NO_FOOTNOTES: InlineFootnotes = {};
const NO_OPTIONS: InlineRenderOptions = {};
const CITATION_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };
const PAREN_OPEN_TAIL = /\(\s*$/;
const PAREN_CLOSE_HEAD = /^\s*\)/;
const LINK_OPEN_FAILED_TITLE = 'Could not open link';
const SUPERSCRIPT_RAISE = Math.round(typeScale.caption / 2);
const SUBSCRIPT_DROP = Math.round(typeScale.caption / 4);

function chooseInlineAction(
  title: string,
  dismissLabel: string,
  actions: ConversationMenuAction[],
): void {
  if (Platform.OS === 'ios') {
    Alert.alert(title, undefined, [
      ...actions.map((action) => ({ text: action.label, onPress: action.run })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
    return;
  }
  showActionMenu({ title, dismissLabel, actions });
}

function openSystemIntent(url: string): void {
  const target = systemIntentTarget(url, Platform.OS);
  const failed = () =>
    Alert.alert('Could not open link', 'Nothing on this device could open that link.');
  if (!target) {
    failed();
    return;
  }
  Linking.openURL(target).catch(failed);
}

export function openAssistantLink(url: string): void {
  const action = resolveAnswerLink(url);
  if (action.kind === 'web') {
    void openSource(action.url, LINK_OPEN_FAILED_TITLE);
    return;
  }
  if (action.kind === 'route') {
    router.push(action.route as Parameters<typeof router.push>[0]);
    return;
  }
  if (action.kind !== 'system') return;
  const prompt = getSystemIntentPrompt(url);
  if (!prompt) return;
  Alert.alert(prompt.title, prompt.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => openSystemIntent(url) },
  ]);
}

function AssistantLink({
  href,
  colors: renderColors,
  imageConsent,
  children,
}: {
  href: string;
  colors: ColorScheme;
  imageConsent?: InlineImageConsent | null;
  children: React.ReactNode;
}) {
  const { copy } = useCopyAction();
  const target = linkOpenTarget(href);
  const copyLink = async () => {
    if (await copy(target)) showToast(COPIED_LABEL);
  };
  const showMenu = () =>
    chooseInlineAction(linkDisplayText(target), 'Dismiss link actions', [
      { key: 'open', label: 'Open', run: () => openAssistantLink(href) },
      ...(imageConsent
        ? [
            {
              key: 'load-image',
              label: `Load image from ${imageConsent.host}`,
              run: imageConsent.load,
            },
          ]
        : []),
      { key: 'copy-link', label: 'Copy Link', run: () => void copyLink() },
      {
        key: 'share-link',
        label: 'Share Link',
        run: () => void Share.share({ message: target }).catch(() => undefined),
      },
    ]);
  return (
    <Text
      variant="inline"
      style={{ color: renderColors.textPrimary, textDecorationLine: 'underline' }}
      onPress={() => openAssistantLink(href)}
      onLongPress={showMenu}
      accessibilityRole="link"
    >
      {children}
    </Text>
  );
}

function showFootnote(number: string, note: string): void {
  Alert.alert(`Footnote ${number}`, inlinePlainText(note));
}

export function inlineCodeStyle(renderColors: ColorScheme): TextStyle {
  return {
    fontFamily: codeFontFamily,
    fontSize: typeScale.footnote,
    backgroundColor: renderColors.surfaceHover,
    color: renderColors.textPrimary,
  };
}

function styleFor(style: InlineStyleName, renderColors: ColorScheme): TextStyle {
  switch (style) {
    case 'strong':
      return { fontWeight: '700' };
    case 'em':
      return { fontStyle: 'italic' };
    case 'strongEm':
      return { fontWeight: '700', fontStyle: 'italic' };
    case 'strike':
      return { textDecorationLine: 'line-through', color: renderColors.textMuted };
    case 'underline':
      return { textDecorationLine: 'underline' };
    case 'small':
    case 'sup':
    case 'sub':
      return { fontSize: typeScale.caption };
    case 'mark':
      return { backgroundColor: renderColors.surfaceHover };
  }
}

interface InlineRenderContext {
  readonly colors: ColorScheme;
  readonly citations: readonly CitationSource[];
  readonly footnotes: InlineFootnotes;
  readonly footnoteOrder: readonly string[];
  readonly options: InlineRenderOptions;
}

interface CitedSource {
  readonly number: number;
  readonly source: CitationSource;
}

function citedSources(
  numbers: readonly number[],
  citations: readonly CitationSource[],
): CitedSource[] {
  const cited: CitedSource[] = [];
  for (const number of numbers) {
    const source = citations[number - 1];
    if (!source || !canPreviewCitation(source)) continue;
    if (!cited.some((entry) => entry.number === number)) cited.push({ number, source });
  }
  return cited;
}

function sourcesOfNode(node: InlineNode, citations: readonly CitationSource[]): CitedSource[] {
  if (node.type === 'citation') return citedSources(node.markers, citations);
  if (node.type !== 'link' || citations.length === 0) return [];
  if (!isCitationOnlyLinkText(inlineNodesText(node.children), node.href)) return [];
  const index = findCitationIndexForUrl(
    node.href,
    citations.map((citation) => ({ url: citation.url ?? '' })),
  );
  return index === undefined ? [] : citedSources([index], citations);
}

function publisherOf(source: CitationSource): string {
  return sourcePublisher({
    url: source.url ?? '',
    ...(source.title ? { title: source.title } : {}),
  });
}

function citationName(cited: CitedSource): string {
  return cited.source.title || publisherOf(cited.source);
}

function previewCitedSources(cited: readonly CitedSource[]): void {
  const [only] = cited;
  if (cited.length === 1 && only) {
    previewCitation(only.source);
    return;
  }
  chooseInlineAction(
    `${cited.length} sources`,
    'Dismiss sources',
    cited.map((entry) => ({
      key: `source-${entry.number}`,
      label: `[${entry.number}] ${citationName(entry)}`,
      run: () => previewCitation(entry.source),
    })),
  );
}

function CitationMarker({
  cited,
  colors: renderColors,
}: {
  cited: readonly CitedSource[];
  colors: ColorScheme;
}) {
  if (cited.length === 0) return null;
  const numbers = cited.map((entry) => entry.number).join(', ');
  return (
    <Pressable
      onPress={() => previewCitedSources(cited)}
      hitSlop={CITATION_HIT_SLOP}
      accessibilityRole="link"
      accessibilityLabel={`Citation ${numbers}: ${cited.map(citationName).join('; ')}`}
    >
      <Text variant="inline" style={{ color: renderColors.teal, fontSize: typeScale.caption }}>
        {`[${numbers}]`}
      </Text>
    </Pressable>
  );
}

type InlineItem =
  | { readonly kind: 'node'; readonly node: InlineNode }
  | { readonly kind: 'cited'; readonly cited: readonly CitedSource[] };

type TextNode = Extract<InlineNode, { readonly type: 'text' }>;

const SPACES_ONLY = /^[ \t]*$/;

function withNewSources(
  cited: readonly CitedSource[],
  added: readonly CitedSource[],
): readonly CitedSource[] {
  const fresh = added.filter((entry) => !cited.some((known) => known.number === entry.number));
  return fresh.length > 0 ? [...cited, ...fresh] : cited;
}

function sharesSource(cited: readonly CitedSource[], added: readonly CitedSource[]): boolean {
  return added.some((entry) => cited.some((known) => known.number === entry.number));
}

/**
 * A model often links a source and then writes its marker too, or repeats a
 * marker. Markers that touch are drawn as one marker, as on the web; a marker
 * parted from the one before it only by spaces joins it only when it repeats
 * one of its sources. A line break always keeps markers apart.
 */
function joinAdjacentCitations(
  nodes: readonly InlineNode[],
  citations: readonly CitationSource[],
): InlineItem[] {
  const items: InlineItem[] = [];
  let gap: TextNode | null = null;
  for (const node of nodes) {
    const cited = sourcesOfNode(node, citations);
    const last = items[items.length - 1];
    if (
      cited.length > 0 &&
      last?.kind === 'cited' &&
      (gap === null || gap.value === '' || sharesSource(last.cited, cited))
    ) {
      items[items.length - 1] = { kind: 'cited', cited: withNewSources(last.cited, cited) };
      gap = null;
      continue;
    }
    if (gap) items.push({ kind: 'node', node: gap });
    gap = null;
    const previous = items[items.length - 1];
    if (cited.length > 0) {
      items.push({ kind: 'cited', cited });
    } else if (previous?.kind === 'cited' && node.type === 'text' && SPACES_ONLY.test(node.value)) {
      gap = node;
    } else {
      items.push({ kind: 'node', node });
    }
  }
  if (gap) items.push({ kind: 'node', node: gap });
  return items;
}

function unwrapCitationParens(
  nodes: readonly InlineNode[],
  citations: readonly CitationSource[],
): readonly InlineNode[] {
  if (citations.length === 0) return nodes;
  const list = [...nodes];
  for (let index = 1; index < list.length - 1; index += 1) {
    const prev = list[index - 1];
    const next = list[index + 1];
    if (prev?.type !== 'text' || next?.type !== 'text') continue;
    if (sourcesOfNode(list[index]!, citations).length === 0) continue;
    const open = PAREN_OPEN_TAIL.exec(prev.value);
    const close = PAREN_CLOSE_HEAD.exec(next.value);
    if (!open || !close) continue;
    list[index - 1] = { type: 'text', value: prev.value.slice(0, open.index) };
    list[index + 1] = { type: 'text', value: next.value.slice(close[0].length) };
  }
  return list;
}

function renderNode(node: InlineNode, key: string, context: InlineRenderContext): React.ReactNode {
  const { colors: renderColors, footnotes } = context;
  switch (node.type) {
    case 'text':
      return node.value;
    case 'math':
      return (
        <MathBlock key={key} latex={node.tex} display={false} color={renderColors.textPrimary} />
      );
    case 'code':
      return (
        <Text variant="inline" key={key} style={inlineCodeStyle(renderColors)}>
          {node.value}
        </Text>
      );
    case 'styled': {
      const span = (
        <Text
          variant="inline"
          key={node.style === 'sup' || node.style === 'sub' ? undefined : key}
          style={{ color: renderColors.textPrimary, ...styleFor(node.style, renderColors) }}
        >
          {renderNodes(node.children, key, context)}
        </Text>
      );
      if (node.style !== 'sup' && node.style !== 'sub') return span;
      const shift = node.style === 'sup' ? -SUPERSCRIPT_RAISE : SUBSCRIPT_DROP;
      return (
        <View
          key={key}
          testID="markdown-script-shift"
          style={{ transform: [{ translateY: shift }] }}
        >
          {span}
        </View>
      );
    }
    case 'link': {
      const label = renderNodes(node.children, key, context);
      if (resolveAnswerLink(node.href).kind === 'plain') {
        return (
          <Text variant="inline" key={key} style={{ color: renderColors.textPrimary }}>
            {label}
          </Text>
        );
      }
      return (
        <AssistantLink key={key} href={node.href} colors={renderColors}>
          {label}
        </AssistantLink>
      );
    }
    case 'footnote': {
      const note = footnotes[node.label];
      const number = footnoteNumber(node.label, context.footnoteOrder);
      const { onFootnotePress } = context.options;
      return (
        <Text
          variant="inline"
          key={key}
          style={{ color: renderColors.textPrimary }}
          accessibilityLabel={`Footnote ${number}`}
          {...(note
            ? {
                accessibilityRole: 'button' as const,
                onPress: () =>
                  onFootnotePress ? onFootnotePress(node.label) : showFootnote(number, note),
              }
            : {})}
        >
          {footnoteMarker(node.label, context.footnoteOrder)}
        </Text>
      );
    }
    case 'badge':
      return (
        <View
          key={key}
          testID="markdown-answer-badge"
          accessible
          accessibilityLabel={node.label}
          style={{
            backgroundColor: renderColors.successSurface,
            borderRadius: radii.full,
            paddingHorizontal: spacing.sm,
            marginHorizontal: spacing.xs,
          }}
        >
          <Text
            variant="inline"
            style={{
              color: renderColors.agentSuccess,
              fontSize: typeScale.caption,
              fontWeight: '500',
            }}
          >
            {node.label}
          </Text>
        </View>
      );
    case 'citation':
      return node.raw;
  }
}

function renderNodes(
  nodes: readonly InlineNode[],
  keyBase: string,
  context: InlineRenderContext,
): React.ReactNode[] {
  const { citations } = context;
  return joinAdjacentCitations(unwrapCitationParens(nodes, citations), citations).map(
    (item, index) =>
      item.kind === 'cited' ? (
        <CitationMarker key={`${keyBase}-${index}`} cited={item.cited} colors={context.colors} />
      ) : (
        renderNode(item.node, `${keyBase}-${index}`, context)
      ),
  );
}

const IMAGE_LINK_LABEL = 'Image';

function renderMarkdownNodes(
  source: string,
  keyBase: string,
  renderColors: ColorScheme,
  citations: readonly CitationSource[],
  footnotes: InlineFootnotes,
  options: InlineRenderOptions,
): React.ReactNode[] {
  const nodes = parseInlineMarkdown(source, {
    citationCount: options.linkifyNumericCitations === false ? 0 : citations.length,
    ...(options.linkDefinitions ? { linkDefinitions: options.linkDefinitions } : {}),
  });
  return renderNodes(nodes, keyBase, {
    colors: renderColors,
    citations,
    footnotes,
    footnoteOrder: Object.keys(footnotes),
    options,
  });
}

function renderInlineImage(
  piece: Extract<ParagraphPiece, { kind: 'image' }>,
  key: string,
  renderColors: ColorScheme,
  trustedImageKeys: ReadonlySet<string>,
): React.ReactNode {
  const src = restoreEscapes(piece.src);
  const alt = restoreEscapes(piece.alt);
  return (
    <InlineMarkdownImage
      key={key}
      src={src}
      alt={alt}
      {...(piece.title ? { title: restoreEscapes(piece.title) } : {})}
      trustedImageKeys={trustedImageKeys}
      link={(imageConsent) => (
        <AssistantLink href={src} colors={renderColors} imageConsent={imageConsent}>
          {alt || IMAGE_LINK_LABEL}
        </AssistantLink>
      )}
    />
  );
}

export function renderInlineMarkdown(
  source: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
  citations: readonly CitationSource[] = [],
  footnotes: InlineFootnotes = NO_FOOTNOTES,
  options: InlineRenderOptions = NO_OPTIONS,
): React.ReactNode[] {
  const pieces = options.trustedImageKeys ? splitInlineImages(source, false) : null;
  if (!pieces) {
    return renderMarkdownNodes(source, keyBase, renderColors, citations, footnotes, options);
  }
  return pieces.flatMap((piece, index) =>
    piece.kind === 'image'
      ? [
          renderInlineImage(
            piece,
            `${keyBase}-img-${index}`,
            renderColors,
            options.trustedImageKeys!,
          ),
        ]
      : renderMarkdownNodes(
          piece.text,
          `${keyBase}-${index}`,
          renderColors,
          citations,
          footnotes,
          options,
        ),
  );
}
