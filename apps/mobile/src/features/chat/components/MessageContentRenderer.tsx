import { useMemo, useState } from 'react';
import { View, Linking, ScrollView, Alert, type LayoutChangeEvent } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
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
} from '@/src/features/chat/utils/externalUrls';
import {
  tokenizeCode,
  syntaxTokenColor,
  type SyntaxToken,
} from '@/src/features/chat/utils/syntaxHighlight';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { normalizeMarkdownSource } from '@agiworkforce/utils/markdown-source';
import { canPreviewCitation, previewCitation, type CitationSource } from './CitationChip';
import { createReportSectionIds } from '@/src/features/research/reportSections';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';
import { Download } from 'lucide-react-native';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import { markdownTableToCsv } from '@/src/features/chat/utils/tableCsv';

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

export function renderInlineMarkdown(
  source: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
  citations: readonly CitationSource[] = [],
): React.ReactNode[] {
  const text = protectEscapes(source);
  const parts: React.ReactNode[] = [];
  const inlineRegex =
    /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[(\d{1,3})\](?!\())/g;
  let lastIdx = 0;
  let inlineMatch: RegExpExecArray | null;
  let inlineKey = 0;

  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    if (inlineMatch.index > lastIdx) {
      const plain = text.slice(lastIdx, inlineMatch.index);
      parts.push(...renderInlineMath(plain, `${keyBase}-pre-${inlineKey}`));
    }

    if (inlineMatch[2]) {
      parts.push(
        <Text
          key={`bold-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontWeight: '700' }}
        >
          {restoreEscapes(inlineMatch[2])}
        </Text>,
      );
    } else if (inlineMatch[3]) {
      parts.push(
        <Text
          key={`italic-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontStyle: 'italic' }}
        >
          {restoreEscapes(inlineMatch[3])}
        </Text>,
      );
    } else if (inlineMatch[4]) {
      parts.push(
        <Text
          key={`strike-${keyBase}-${inlineKey++}`}
          style={{ textDecorationLine: 'line-through', color: renderColors.textMuted }}
        >
          {restoreEscapes(inlineMatch[4])}
        </Text>,
      );
    } else if (inlineMatch[5]) {
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
          {` ${restoreEscapes(inlineMatch[5], true)} `}
        </Text>,
      );
    } else if (inlineMatch[6] && inlineMatch[7]) {
      const linkText = restoreEscapes(inlineMatch[6]);
      const linkUrl = restoreEscapes(inlineMatch[7]);
      parts.push(
        <Text
          key={`link-${keyBase}-${inlineKey++}`}
          style={{
            color: renderColors.teal,
            textDecorationLine: 'underline',
          }}
          onPress={() => openAssistantLink(linkUrl)}
          accessibilityRole="link"
          accessibilityLabel={linkText}
        >
          {linkText}
        </Text>,
      );
    } else if (inlineMatch[8]) {
      const marker = Number(inlineMatch[8]);
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

const listItemPattern = /^(\s*)(?:([-*])|(\d+)\.)\s+(.+)$/;
const nestedBullets = ['•', '◦', '▪'];

type ParsedListItem = { depth: number; marker: string; ordered: boolean; text: string };

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
    items.push({
      depth,
      ordered,
      marker: ordered ? `${match[3]}.` : nestedBullets[Math.min(depth, nestedBullets.length - 1)]!,
      text: match[4]!,
    });
    idx++;
  }

  return { items, next: idx };
}

interface SegmentContext {
  citations: readonly CitationSource[];
  sectionId?: (heading: string, level: number) => string | null;
  onHeadingLayout?: (id: string, y: number) => void;
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

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (idx < lines.length && lines[idx]!.startsWith('> ')) {
        const body = lines[idx]!.slice(2);
        if (body.trim().length > 0) {
          quoteLines.push(body);
        }
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
          <Text
            style={{
              fontSize: typeScale.subhead,
              fontStyle: 'italic',
              color: renderColors.textSecondary,
              lineHeight: 21,
            }}
            selectable
          >
            {renderInlineMarkdown(
              quoteLines.join('\n'),
              `${keyBase}-bqil-${idx}`,
              renderColors,
              citations,
            )}
          </Text>
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
          style={{ color: renderColors.textPrimary, fontSize: typeScale.body, lineHeight: 23 }}
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

function renderCodeCard(
  key: string,
  codeContent: string,
  fenceLanguage: string | undefined,
  highlightCode: boolean,
  renderColors: ColorScheme,
): React.ReactElement {
  const languageLabel = fenceLanguage && fenceLanguage.length > 0 ? fenceLanguage : 'Plain text';
  const codeTokens: SyntaxToken[] = highlightCode
    ? tokenizeCode(codeContent, fenceLanguage)
    : [{ text: codeContent, type: 'plain' }];
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
        <CodeBlockCopyButton code={codeContent} />
      </View>
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
      </ScrollView>
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
      const fenceLanguage = match[3]?.trim().split(/\s+/)[0];
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
