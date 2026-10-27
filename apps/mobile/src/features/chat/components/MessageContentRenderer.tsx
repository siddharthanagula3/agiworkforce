import { useMemo, useState } from 'react';
import { View, Linking, ScrollView, Alert, type LayoutChangeEvent } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { MathBlock } from './MathBlock';
import { ReportChart } from './ReportChart';
import { MermaidDiagramBlock } from './MermaidDiagramBlock';
import { parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  classifyExternalLink,
  getSystemIntentPrompt,
  isValidExternalHttpUrl,
} from '@/src/features/chat/utils/externalUrls';
import {
  tokenizeCode,
  syntaxTokenColor,
  type SyntaxToken,
} from '@/src/features/chat/utils/syntaxHighlight';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { normalizeMarkdownSource } from '@agiworkforce/utils/markdown-source';
import { classifyAssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import { AssistantSurface } from './AssistantSurface';
import { canPreviewCitation, previewCitation, type CitationSource } from './CitationChip';
import { createReportSectionIds } from '@/src/features/research/reportSections';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';
import { Check, Download } from 'lucide-react-native';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import { markdownTableToCsv } from '@/src/features/chat/utils/tableCsv';
import { artifactSourceExtension } from '@/src/features/chat/utils/artifactExport';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { GeneratedImage } from './GeneratedImage';

const MIN_TABLE_COLUMN_WIDTH = 120;
const MAX_TABLE_COLUMN_WIDTH = 260;
const WIDE_TABLE_GUTTER = 24;

export function wideTableOverflow(input: {
  tableWidth: number;
  containerWidth: number;
  paneWidth: number;
}): number {
  const { tableWidth, containerWidth, paneWidth } = input;
  if (containerWidth <= 0 || tableWidth <= containerWidth) return 0;
  const widest = Math.max(containerWidth, paneWidth - WIDE_TABLE_GUTTER * 2);
  return Math.max(0, Math.min(tableWidth, widest) - containerWidth);
}
const TABLE_COLUMN_CHARACTER_WIDTH = 8;
const TABLE_COLUMN_PADDING = 16;
const ESCAPABLE_PUNCTUATION = /[!-/:-@[-`{-~]/;
const ESCAPE_SENTINEL_BASE = 0xe000;
const ESCAPE_SENTINELS = /[\ue021-\ue07e]/g;
const INLINE_MATH = /(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g;

function codeSpanEnd(text: string, open: number): number {
  const close = text.indexOf('`', open + 1);
  return close === -1 || text.slice(open + 1, close).includes('\n') ? -1 : close;
}

function inlineMathEnd(text: string, open: number): number {
  if (text[open - 1] === '$' || text[open + 1] === '$') return -1;
  const close = text.indexOf('$', open + 1);
  if (close <= open + 1 || text.slice(open + 1, close).includes('\n')) return -1;
  return text[close - 1] === '\\' || text[close + 1] === '$' ? -1 : close;
}

function protectEscapes(text: string): string {
  let out = '';
  let idx = 0;
  while (idx < text.length) {
    const ch = text[idx]!;
    const next = text[idx + 1];
    if (ch === '\\' && next !== undefined && ESCAPABLE_PUNCTUATION.test(next)) {
      out += String.fromCharCode(ESCAPE_SENTINEL_BASE + next.charCodeAt(0));
      idx += 2;
      continue;
    }
    const spanEnd =
      ch === '`' ? codeSpanEnd(text, idx) : ch === '$' ? inlineMathEnd(text, idx) : -1;
    if (spanEnd !== -1) {
      out += text.slice(idx, spanEnd + 1);
      idx = spanEnd + 1;
      continue;
    }
    out += ch;
    idx += 1;
  }
  return out;
}

function restoreEscapes(text: string, keepBackslash = false): string {
  return text.replace(ESCAPE_SENTINELS, (sentinel) => {
    const literal = String.fromCharCode(sentinel.charCodeAt(0) - ESCAPE_SENTINEL_BASE);
    return keepBackslash ? `\\${literal}` : literal;
  });
}

function openAssistantLink(url: string): void {
  const kind = classifyExternalLink(url);
  if (kind === 'http') {
    void openUntrustedUrlInAppBrowser(url);
    return;
  }
  if (kind !== 'system-intent') return;
  const prompt = getSystemIntentPrompt(url);
  if (!prompt) return;
  Alert.alert(prompt.title, prompt.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => Linking.openURL(url).catch(() => undefined) },
  ]);
}

export function renderInlineMath(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mathRegex = new RegExp(INLINE_MATH);
  let lastIdx = 0;
  let keyCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(restoreEscapes(text.slice(lastIdx, match.index)));
    }
    parts.push(
      <MathBlock
        key={`${keyBase}-imath-${keyCounter++}`}
        latex={restoreEscapes(match[1]!.trim(), true)}
        display={false}
      />,
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(restoreEscapes(text.slice(lastIdx)));
  }
  return parts;
}

const AUTOLINK_TRAILING_PUNCTUATION = /[?!.,:;*_~'"]$/;

/**
 * A closing parenthesis stays only while it is balanced, so a Wikipedia
 * "Foo_(bar)" path keeps its bracket and "(see https://a.example/x)" drops the
 * one that closes the sentence.
 */
function trimAutolink(candidate: string): string {
  let url = candidate;
  for (;;) {
    if (AUTOLINK_TRAILING_PUNCTUATION.test(url)) {
      url = url.slice(0, -1);
      continue;
    }
    if (url.endsWith(')') && url.split(')').length > url.split('(').length) {
      url = url.slice(0, -1);
      continue;
    }
    return url;
  }
}

function autolinkHref(url: string): string | null {
  const href = url.startsWith('www.') ? `https://${url}` : url;
  if (!isValidExternalHttpUrl(href)) return null;
  return new URL(href).hostname.includes('.') ? href : null;
}

function renderLink(
  key: string,
  label: string,
  url: string,
  renderColors: ColorScheme,
): React.ReactElement {
  return (
    <Text
      key={key}
      style={{
        color: renderColors.teal,
        textDecorationLine: 'underline',
      }}
      onPress={() => openAssistantLink(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      {label}
    </Text>
  );
}

export function renderInlineMarkdown(
  source: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
  citations: readonly CitationSource[] = [],
): React.ReactNode[] {
  const text = protectEscapes(source);
  const parts: React.ReactNode[] = [];
  const inlineRegex =
    /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[(\d{1,3})\](?!\()|<(https?:\/\/[^\s<>]+)>|(?<![A-Za-z0-9/@.-])((?:https?:\/\/|www\.)[^\s<>]+))/g;
  let lastIdx = 0;
  let inlineMatch: RegExpExecArray | null;
  let inlineKey = 0;
  const nested = (inner: string, kind: string) =>
    renderInlineMarkdown(inner, `${keyBase}-${kind}${inlineKey}`, renderColors, citations);

  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    if (inlineMatch.index > lastIdx) {
      const plain = text.slice(lastIdx, inlineMatch.index);
      parts.push(...renderInlineMath(plain, `${keyBase}-pre-${inlineKey}`));
    }

    if (inlineMatch[2]) {
      parts.push(
        <Text
          key={`bolditalic-${keyBase}-${inlineKey}`}
          style={{ color: renderColors.textPrimary, fontWeight: '700', fontStyle: 'italic' }}
        >
          {nested(inlineMatch[2], 'bi')}
        </Text>,
      );
      inlineKey++;
    } else if (inlineMatch[3]) {
      parts.push(
        <Text
          key={`bold-${keyBase}-${inlineKey}`}
          style={{ color: renderColors.textPrimary, fontWeight: '700' }}
        >
          {nested(inlineMatch[3], 'b')}
        </Text>,
      );
      inlineKey++;
    } else if (inlineMatch[4]) {
      parts.push(
        <Text
          key={`italic-${keyBase}-${inlineKey}`}
          style={{ color: renderColors.textPrimary, fontStyle: 'italic' }}
        >
          {nested(inlineMatch[4], 'i')}
        </Text>,
      );
      inlineKey++;
    } else if (inlineMatch[5]) {
      parts.push(
        <Text
          key={`strike-${keyBase}-${inlineKey}`}
          style={{ textDecorationLine: 'line-through', color: renderColors.textMuted }}
        >
          {nested(inlineMatch[5], 's')}
        </Text>,
      );
      inlineKey++;
    } else if (inlineMatch[6]) {
      parts.push(
        <Text
          key={`code-${keyBase}-${inlineKey++}`}
          style={{
            fontFamily: 'Menlo',
            fontSize: typeScale.footnote,
            backgroundColor: renderColors.surfaceHover,
            color: renderColors.textPrimary,
          }}
        >
          {` ${restoreEscapes(inlineMatch[6], true)} `}
        </Text>,
      );
    } else if (inlineMatch[7] && inlineMatch[8]) {
      parts.push(
        renderLink(
          `link-${keyBase}-${inlineKey++}`,
          restoreEscapes(inlineMatch[7]),
          restoreEscapes(inlineMatch[8]),
          renderColors,
        ),
      );
    } else if (inlineMatch[10]) {
      const url = restoreEscapes(inlineMatch[10]);
      const href = autolinkHref(url);
      parts.push(
        href
          ? renderLink(`autolink-${keyBase}-${inlineKey++}`, url, href, renderColors)
          : restoreEscapes(inlineMatch[0]),
      );
    } else if (inlineMatch[11]) {
      const display = trimAutolink(inlineMatch[11]);
      const url = restoreEscapes(display);
      const href = display ? autolinkHref(url) : null;
      if (href) {
        parts.push(renderLink(`autolink-${keyBase}-${inlineKey++}`, url, href, renderColors));
        const trailing = inlineMatch[11].slice(display.length);
        if (trailing) parts.push(restoreEscapes(trailing));
      } else {
        parts.push(restoreEscapes(inlineMatch[11]));
      }
    } else if (inlineMatch[9]) {
      const marker = Number(inlineMatch[9]);
      const citation = citations[marker - 1];
      if (citation && canPreviewCitation(citation)) {
        parts.push(
          <Text
            key={`cite-${keyBase}-${inlineKey++}`}
            style={{ color: renderColors.teal, fontWeight: '600' }}
            onPress={() => previewCitation(citation)}
            accessibilityRole="link"
            accessibilityLabel={`Citation ${marker}: ${citation.title || citation.url}`}
          >
            {`[${marker}]`}
          </Text>,
        );
      } else {
        parts.push(inlineMatch[0]);
      }
    }

    lastIdx = inlineMatch.index + inlineMatch[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(...renderInlineMath(text.slice(lastIdx), `${keyBase}-post`));
  }

  return parts;
}

const listItemPattern = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.+)$/;
const taskItemPattern = /^\[([ xX])\]\s+(.*)$/;
const quoteLinePattern = /^ {0,3}>/;
const quoteMarkerPattern = /^ {0,3}> ?/;
const accountImagePattern = /^!\[([^\]]*)\]\(<?([^()<>\s]+)>?\)$/;
const nestedBullets = ['•', '◦', '▪'];

type ParsedListItem = {
  depth: number;
  marker: string;
  ordered: boolean;
  text: string;
  task?: { checked: boolean };
};

const TABLE_SORT_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function tableCellNumber(value: string): number {
  const trimmed = value.trim();
  if (!/^[-+(]?[$€£₹]?[\d.,]+%?\)?$/.test(trimmed)) return Number.NaN;
  const negative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const parsed = Number(trimmed.replace(/[()%$€£₹,\s]/g, ''));
  return negative ? -parsed : parsed;
}

function compareTableCells(a: string, b: string): number {
  const left = tableCellNumber(a);
  const right = tableCellNumber(b);
  if (!Number.isNaN(left) && !Number.isNaN(right)) return left - right;
  return TABLE_SORT_COLLATOR.compare(a, b);
}

type TableSort = { column: number; direction: 'ascending' | 'descending' } | null;

function MarkdownTable({
  rows,
  columnWidths,
  keyBase,
  renderColors,
  citations,
}: {
  rows: string[][];
  columnWidths: number[];
  keyBase: string;
  renderColors: ColorScheme;
  citations: readonly CitationSource[];
}) {
  const [sort, setSort] = useState<TableSort>(null);
  const [header = [], ...body] = rows;
  const numCols = columnWidths.length;
  const sortedBody = useMemo(() => {
    if (!sort) return body;
    const ordered = [...body].sort((a, b) =>
      compareTableCells(a[sort.column] ?? '', b[sort.column] ?? ''),
    );
    return sort.direction === 'ascending' ? ordered : ordered.reverse();
  }, [body, sort]);
  const sortable = body.length > 1;
  const { contentWidth: paneWidth } = useResponsiveLayout();
  const [containerWidth, setContainerWidth] = useState(0);
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0) + 2;
  const overflow = wideTableOverflow({ tableWidth, containerWidth, paneWidth });

  const cellStyle = (colIdx: number) => ({
    width: columnWidths[colIdx],
    borderRightWidth: colIdx < numCols - 1 ? 1 : 0,
    borderRightColor: renderColors.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center' as const,
  });

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width)}
      testID="markdown-table-frame"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={{ marginVertical: 8, marginHorizontal: -overflow / 2 }}
        testID="markdown-table"
        contentContainerStyle={{
          borderWidth: 1,
          borderColor: renderColors.border,
          borderRadius: 4,
          overflow: 'hidden',
          flexDirection: 'column',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: renderColors.border,
            backgroundColor: renderColors.surfaceHover,
          }}
        >
          {Array.from({ length: numCols }).map((_, colIdx) => {
            const label = header[colIdx] ?? '';
            const active = sort?.column === colIdx ? sort.direction : null;
            const next = active === 'ascending' ? 'descending' : 'ascending';
            const content = (
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: renderColors.textPrimary,
                  fontWeight: '500',
                  lineHeight: 19,
                }}
              >
                {renderInlineMarkdown(label, `${keyBase}-th-${colIdx}`, renderColors, citations)}
                {active ? (active === 'ascending' ? ' \u2191' : ' \u2193') : ''}
              </Text>
            );
            return sortable ? (
              <Pressable
                key={`${keyBase}-th-${colIdx}`}
                style={cellStyle(colIdx)}
                onPress={() => setSort({ column: colIdx, direction: next })}
                accessibilityRole="button"
                accessibilityLabel={`${label}${active ? `, sorted ${active}` : ''}`}
                accessibilityHint={`Sorts the table by this column, ${next}`}
              >
                {content}
              </Pressable>
            ) : (
              <View key={`${keyBase}-th-${colIdx}`} style={cellStyle(colIdx)}>
                {content}
              </View>
            );
          })}
        </View>
        {sortedBody.map((row, rowIdx) => (
          <View key={`${keyBase}-tr-${rowIdx}`} style={{ flexDirection: 'row' }}>
            {Array.from({ length: numCols }).map((_, colIdx) => (
              <View key={`${keyBase}-td-${rowIdx}-${colIdx}`} style={cellStyle(colIdx)}>
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    color: renderColors.textSecondary,
                    fontWeight: '400',
                    lineHeight: 19,
                  }}
                  selectable
                >
                  {renderInlineMarkdown(
                    row[colIdx] || '',
                    `${keyBase}-tdil-${rowIdx}-${colIdx}`,
                    renderColors,
                    citations,
                  )}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <Pressable
        onPress={() => {
          void exportSourceFile(markdownTableToCsv([header, ...sortedBody]), 'table', 'csv')
            .then((result) => shareFile(result.uri))
            .catch(() => {
              Alert.alert('Download failed', 'Could not save this table as CSV. Try again.');
            });
        }}
        accessibilityRole="button"
        accessibilityLabel="Download table as CSV"
        style={{
          alignSelf: 'flex-end',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          minHeight: 44,
          paddingHorizontal: 8,
        }}
      >
        <Download size={14} color={renderColors.textSecondary} />
        <Text style={{ fontSize: typeScale.caption, color: renderColors.textSecondary }}>CSV</Text>
      </Pressable>
    </View>
  );
}

function collectListItems(
  lines: string[],
  start: number,
): { items: ParsedListItem[]; next: number } {
  const items: ParsedListItem[] = [];
  const indentStack: number[] = [];
  let idx = start;

  while (idx < lines.length) {
    const match = lines[idx]!.match(listItemPattern);
    if (!match) break;

    const indent = match[1]!.replace(/\t/g, '  ').length;
    while (indentStack.length > 0 && indent < indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }
    if (indentStack.length === 0 || indent > indentStack[indentStack.length - 1]!) {
      indentStack.push(indent);
    }

    const depth = indentStack.length - 1;
    const ordered = match[3] !== undefined;
    const task = taskItemPattern.exec(match[4]!);
    items.push({
      depth,
      ordered,
      marker: ordered ? `${match[3]}.` : nestedBullets[Math.min(depth, nestedBullets.length - 1)]!,
      text: task ? task[2]! : match[4]!,
      ...(task ? { task: { checked: task[1] !== ' ' } } : {}),
    });
    idx++;
  }

  return { items, next: idx };
}

interface SegmentContext {
  citations: readonly CitationSource[];
  sectionId?: (heading: string, level: number) => string | null;
  onHeadingLayout?: (id: string, y: number) => void;
  quoted?: boolean;
}

function TaskCheckbox({ checked, colors }: { checked: boolean; colors: ColorScheme }) {
  return (
    <View
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: true }}
      accessibilityLabel={checked ? 'Done' : 'Not done'}
      testID="markdown-task-checkbox"
      style={{
        width: 16,
        height: 16,
        marginTop: 3,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: checked ? colors.teal : colors.textMuted,
        backgroundColor: checked ? colors.teal : colors.transparent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Check size={11} color={colors.accentText} strokeWidth={3.5} /> : null}
    </View>
  );
}

function renderTextSegment(
  text: string,
  keyBase: string,
  renderColors: ColorScheme,
  context: SegmentContext = { citations: [] },
): React.ReactNode[] {
  const { citations } = context;
  const nodes: React.ReactNode[] = [];
  const lines = protectEscapes(text).split('\n');
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx]!;

    const imageMatch = accountImagePattern.exec(restoreEscapes(line).trim());
    if (imageMatch && resolveGeneratedImageUri(imageMatch[2]!)) {
      nodes.push(
        <View key={`${keyBase}-img-${idx}`} style={{ marginVertical: 6 }}>
          <GeneratedImage imageUrl={imageMatch[2]!} revisedPrompt={imageMatch[1] || undefined} />
        </View>,
      );
      idx++;
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]!.length;
      const headerText = headerMatch[2]!;
      const sectionId = context.sectionId?.(headerText.replace(/\s+#+\s*$/, ''), level) ?? null;
      const onHeadingLayout = context.onHeadingLayout;
      const fontSizes: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 15 };
      nodes.push(
        <Text
          key={`${keyBase}-h${level}-${idx}`}
          style={{
            fontSize: fontSizes[level] ?? 15,
            fontWeight: '700',
            color: renderColors.textPrimary,
            marginTop: 8,
            marginBottom: 4,
            lineHeight: (fontSizes[level] ?? 15) * 1.35,
          }}
          selectable
          {...(sectionId && onHeadingLayout
            ? {
                onLayout: (event: LayoutChangeEvent) =>
                  onHeadingLayout(sectionId, event.nativeEvent.layout.y),
              }
            : {})}
        >
          {renderInlineMarkdown(
            headerText,
            `${keyBase}-h${level}il-${idx}`,
            renderColors,
            citations,
          )}
        </Text>,
      );
      idx++;
      continue;
    }

    if (quoteLinePattern.test(line)) {
      const quoteLines: string[] = [];
      while (idx < lines.length && quoteLinePattern.test(lines[idx]!)) {
        quoteLines.push(lines[idx]!.replace(quoteMarkerPattern, ''));
        idx++;
      }
      nodes.push(
        <View
          key={`${keyBase}-bq-${idx}`}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: renderColors.teal,
            paddingLeft: 10,
            paddingVertical: 4,
            marginVertical: 4,
            backgroundColor: renderColors.surfaceBase,
            borderRadius: 4,
          }}
        >
          {renderTextSegment(quoteLines.join('\n'), `${keyBase}-bq${idx}`, renderColors, {
            ...context,
            quoted: true,
          })}
        </View>,
      );
      continue;
    }

    if (listItemPattern.test(line)) {
      const { items, next } = collectListItems(lines, idx);
      idx = next;
      nodes.push(
        <View key={`${keyBase}-list-${idx}`} style={{ marginVertical: 4, gap: 2 }}>
          {items.map((item, i) => (
            <View
              key={`${keyBase}-li-${idx}-${i}`}
              style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 + item.depth * 16 }}
            >
              {item.task ? (
                <TaskCheckbox checked={item.task.checked} colors={renderColors} />
              ) : (
                <Text
                  style={{
                    fontSize: typeScale.body,
                    color: renderColors.teal,
                    lineHeight: 22,
                    ...(item.ordered
                      ? { minWidth: 18, textAlign: 'right' as const }
                      : { width: 12, textAlign: 'center' as const }),
                  }}
                >
                  {item.marker}
                </Text>
              )}
              <Text
                style={{
                  fontSize: typeScale.body,
                  color: renderColors.textPrimary,
                  lineHeight: 22,
                  flex: 1,
                }}
                selectable
              >
                {renderInlineMarkdown(
                  item.text,
                  `${keyBase}-liil-${idx}-${i}`,
                  renderColors,
                  citations,
                )}
              </Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const parseTableRow = (rowLine: string): string[] => {
      let cells = rowLine.split('|');
      if (cells[0] === '' || (cells[0] && cells[0]!.trim() === '')) {
        cells = cells.slice(1);
      }
      if (
        cells.length > 0 &&
        (cells[cells.length - 1] === '' || cells[cells.length - 1]!.trim() === '')
      ) {
        cells = cells.slice(0, -1);
      }
      return cells.map((cell) => cell.trim());
    };

    if (line.includes('|') && !line.startsWith('>')) {
      const headerCells = parseTableRow(line);
      if (headerCells.length > 0 && idx + 1 < lines.length) {
        const separatorLine = lines[idx + 1];
        if (
          separatorLine &&
          /^\s*\|?[\s\-|:]+\|?[\s\-|:]*$/.test(separatorLine) &&
          separatorLine.includes('-')
        ) {
          const tableRows: string[][] = [];

          const headerRow = parseTableRow(line);
          tableRows.push(headerRow);
          idx += 2;

          while (idx < lines.length && lines[idx]!.includes('|') && !lines[idx]!.startsWith('>')) {
            const bodyRow = parseTableRow(lines[idx]!);
            if (bodyRow.length > 0) {
              tableRows.push(bodyRow);
            }
            idx++;
          }

          if (tableRows.length > 0) {
            const numCols = Math.max(...tableRows.map((row) => row.length));
            const columnWidths = Array.from({ length: numCols }, (_, colIdx) => {
              const longestCell = tableRows.reduce(
                (longest, row) => Math.max(longest, (row[colIdx] ?? '').length),
                0,
              );
              return Math.min(
                MAX_TABLE_COLUMN_WIDTH,
                Math.max(
                  MIN_TABLE_COLUMN_WIDTH,
                  longestCell * TABLE_COLUMN_CHARACTER_WIDTH + TABLE_COLUMN_PADDING,
                ),
              );
            });
            nodes.push(
              <MarkdownTable
                key={`${keyBase}-table-${idx}`}
                rows={tableRows}
                columnWidths={columnWidths}
                keyBase={`${keyBase}-t${idx}`}
                renderColors={renderColors}
                citations={citations}
              />,
            );
          }
          continue;
        }
      }
    }

    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      nodes.push(
        <View
          key={`${keyBase}-hr-${idx}`}
          style={{
            height: 1,
            backgroundColor: renderColors.border,
            marginVertical: 8,
          }}
        />,
      );
      idx++;
      continue;
    }

    if (line.trim()) {
      nodes.push(
        <Text
          key={`${keyBase}-p-${idx}`}
          style={
            context.quoted
              ? {
                  color: renderColors.textSecondary,
                  fontSize: typeScale.subhead,
                  fontStyle: 'italic',
                  lineHeight: 21,
                }
              : { color: renderColors.textPrimary, fontSize: typeScale.body, lineHeight: 23 }
          }
          selectable
        >
          {renderInlineMarkdown(line, `${keyBase}-pil-${idx}`, renderColors, citations)}
        </Text>,
      );
    } else if (idx > 0 && idx < lines.length - 1) {
      nodes.push(<View key={`${keyBase}-sp-${idx}`} style={{ height: 8 }} />);
    }
    idx++;
  }

  return nodes;
}

const PLAIN_TEXT_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['text', 'txt', 'plaintext']);
const DIFF_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['diff', 'patch', 'udiff']);

type DiffLineKind = 'added' | 'removed' | 'context';

const DIFF_LINE_LABELS: Record<DiffLineKind, string> = {
  added: 'Added line: ',
  removed: 'Removed line: ',
  context: '',
};

function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

function DiffCodeLines({ code, colors }: { code: string; colors: ColorScheme }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      style={{ paddingTop: 2, paddingBottom: 10 }}
      contentContainerStyle={{ flexGrow: 1 }}
      testID="markdown-diff"
    >
      <View style={{ flexGrow: 1 }}>
        {code.split('\n').map((line, lineIdx) => {
          const kind = diffLineKind(line);
          return (
            <View
              key={`${lineIdx}-${line}`}
              accessible
              accessibilityLabel={`${DIFF_LINE_LABELS[kind]}${line}`}
              testID={`markdown-diff-line-${kind}`}
              style={{
                paddingHorizontal: 12,
                backgroundColor:
                  kind === 'added'
                    ? colors.diffAddedFill
                    : kind === 'removed'
                      ? colors.diffRemovedFill
                      : colors.transparent,
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                  fontFamily: 'Menlo',
                  color:
                    kind === 'added'
                      ? colors.diffAddedText
                      : kind === 'removed'
                        ? colors.diffRemovedText
                        : colors.textPrimary,
                }}
                selectable
              >
                {line || ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function downloadCodeBlock(code: string, fenceLanguage: string | undefined): void {
  void exportSourceFile(code, 'code', artifactSourceExtension(fenceLanguage))
    .then((result) => shareFile(result.uri))
    .catch(() => {
      Alert.alert('Download failed', 'Could not save this code as a file. Try again.');
    });
}

function renderCodeCard(
  key: string,
  codeContent: string,
  fenceLanguage: string | undefined,
  highlightCode: boolean,
  renderColors: ColorScheme,
): React.ReactElement {
  const languageLabel = fenceLanguage && fenceLanguage.length > 0 ? fenceLanguage : 'Plain text';
  const isDiff = DIFF_FENCE_LANGUAGES.has(fenceLanguage?.toLowerCase() ?? '');
  const codeTokens: SyntaxToken[] = highlightCode
    ? tokenizeCode(codeContent, fenceLanguage)
    : [{ text: codeContent, type: 'plain' }];
  const wrapsLongLines =
    !fenceLanguage || PLAIN_TEXT_FENCE_LANGUAGES.has(fenceLanguage.toLowerCase());
  const codeText = (
    <Text
      style={{
        fontSize: typeScale.footnote,
        lineHeight: 19,
        fontFamily: 'Menlo',
        color: renderColors.textPrimary,
      }}
      selectable
    >
      {codeTokens.map((token, tokenIdx) =>
        token.type === 'plain' ? (
          token.text
        ) : (
          <Text
            key={`${key}-tok-${tokenIdx}`}
            style={{ color: syntaxTokenColor(token.type, renderColors) }}
          >
            {token.text}
          </Text>
        ),
      )}
    </Text>
  );
  return (
    <View
      key={key}
      style={{
        backgroundColor: renderColors.surfaceHover,
        borderRadius: 8,
        marginVertical: 6,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 8,
          paddingTop: 8,
          paddingBottom: 2,
        }}
      >
        <Text
          style={{
            fontSize: typeScale.caption,
            fontWeight: '500',
            color: renderColors.textMuted,
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {languageLabel}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {highlightCode ? (
            <Pressable
              onPress={() => downloadCodeBlock(codeContent, fenceLanguage)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Download code"
              style={{
                padding: 4,
                borderRadius: 4,
                backgroundColor: renderColors.neutralSurface,
              }}
            >
              <Download size={14} color={renderColors.textMuted} />
            </Pressable>
          ) : null}
          <CodeBlockCopyButton code={codeContent} />
        </View>
      </View>
      {isDiff ? (
        <DiffCodeLines code={codeContent} colors={renderColors} />
      ) : wrapsLongLines ? (
        <View style={{ paddingTop: 2, paddingBottom: 10, paddingHorizontal: 12 }}>{codeText}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          scrollEventThrottle={16}
          style={{
            paddingTop: 2,
            paddingBottom: 10,
            paddingHorizontal: 12,
          }}
        >
          {codeText}
        </ScrollView>
      )}
    </View>
  );
}

export interface MarkdownRenderOptions {
  /**
   * A streaming message re-renders on every token, and highlighting re-tokenises
   * the whole fence each time; the plain fence settles into a highlighted one
   * once the turn ends.
   */
  highlightCode?: boolean;
  citations?: readonly CitationSource[];
  onHeadingLayout?: (sectionId: string, y: number) => void;
  onFollowUp?: (text: string) => void;
}

export function renderMarkdownContent(
  content: string,
  renderColors: ColorScheme = defaultColors,
  options: MarkdownRenderOptions = {},
): React.ReactNode[] {
  if (!content) return [];
  const highlightCode = options.highlightCode !== false;
  const context: SegmentContext = {
    citations: options.citations ?? [],
    ...(options.onHeadingLayout
      ? { sectionId: createReportSectionIds(), onHeadingLayout: options.onHeadingLayout }
      : {}),
  };

  const source = normalizeMarkdownSource(content);
  const elements: React.ReactNode[] = [];
  let keyCounter = 0;

  const blockRegex = /(\$\$([\s\S]*?)\$\$|```([^\n]*)\n?([\s\S]*?)```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = source.slice(lastIndex, match.index);
      elements.push(...renderTextSegment(textBefore, `seg-${keyCounter++}`, renderColors, context));
    }

    if (match[2] !== undefined) {
      const mathContent = match[2].trim();
      elements.push(<MathBlock key={`bmath-${keyCounter++}`} latex={mathContent} display={true} />);
    } else if (match[4] !== undefined) {
      const codeContent = match[4].trim();
      const fenceLanguage = match[3]?.trim().split(/\s+/)[0] ?? '';
      const classified = classifyAssistantFence(fenceLanguage, codeContent);
      if (classified.kind !== 'code') {
        elements.push(
          <AssistantSurface
            key={`surface-${keyCounter++}`}
            fence={classified}
            colors={renderColors}
            onFollowUp={options.onFollowUp}
          />,
        );
        lastIndex = match.index + match[0].length;
        continue;
      }
      const chart = fenceLanguage === 'mermaid' ? parseMermaidChart(codeContent) : null;
      if (chart) {
        elements.push(
          <ReportChart key={`chart-${keyCounter++}`} chart={chart} colors={renderColors} />,
        );
        lastIndex = match.index + match[0].length;
        continue;
      }
      const codeCard = renderCodeCard(
        `code-${keyCounter++}`,
        codeContent,
        fenceLanguage,
        highlightCode,
        renderColors,
      );
      elements.push(
        fenceLanguage === 'mermaid' && highlightCode ? (
          <MermaidDiagramBlock
            key={`diagram-${keyCounter++}`}
            source={codeContent}
            colors={renderColors}
            sourceBlock={codeCard}
          />
        ) : (
          codeCard
        ),
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    const remaining = source.slice(lastIndex);
    elements.push(
      ...renderTextSegment(remaining, `seg-tail-${keyCounter++}`, renderColors, context),
    );
  }

  if (elements.length === 0 && source.length > 0) {
    elements.push(...renderTextSegment(source, 'seg-0', renderColors, context));
  }

  return elements;
}
