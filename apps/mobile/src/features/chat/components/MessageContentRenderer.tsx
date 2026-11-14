import { useMemo, useState } from 'react';
import { View, ScrollView, Alert, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { CodeLinesScroller } from '@/src/features/settings/code/CodeLinesScroller';
import { MathBlock } from './MathBlock';
import { ReportChart } from './ReportChart';
import { MermaidDiagramBlock } from './MermaidDiagramBlock';
import { parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import { chatTypography, typeScale } from '@/src/ui/theme/tokens';
import {
  tokenizeCode,
  syntaxTokenColor,
  type SyntaxToken,
} from '@/src/features/chat/utils/syntaxHighlight';
import { normalizeMarkdownSource } from '@agiworkforce/utils/markdown-source';
import { classifyAssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import { AssistantSurface, canRenderAssistantSurface } from './AssistantSurface';
import type { CitationSource } from './CitationChip';
import { protectEscapes, renderInlineMarkdown, restoreEscapes } from './MarkdownInline';
import { MarkdownImage } from './MarkdownImage';
import { createReportSectionIds } from '@/src/features/research/reportSections';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';
import { Download, Square, SquareCheck } from 'lucide-react-native';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import { markdownTableToCsv } from '@/src/features/chat/utils/tableCsv';

const MIN_TABLE_COLUMN_WIDTH = 48;
const MAX_TABLE_COLUMN_WIDTH = 260;
const MIN_FITTED_COLUMN_WIDTH = 72;
const MIN_SCROLLED_COLUMN_WIDTH = 120;
const WIDE_TABLE_GUTTER = 24;
const TABLE_COLUMN_CHARACTER_WIDTH = 8;
const TABLE_COLUMN_GAP = 12;
const TABLE_LONG_TOKEN_LENGTH = 24;
const MIN_LONG_TOKEN_COLUMN_WIDTH = 144;
const MARKDOWN_LINK_TARGET = /\]\([^)]*\)/g;

function clampTableColumnWidth(width: number): number {
  return Math.min(MAX_TABLE_COLUMN_WIDTH, Math.max(MIN_TABLE_COLUMN_WIDTH, width));
}

export function markdownTableNaturalWidth(cells: readonly string[]): number {
  const longestCell = cells.reduce((longest, cell) => Math.max(longest, cell.length), 0);
  return clampTableColumnWidth(longestCell * TABLE_COLUMN_CHARACTER_WIDTH + TABLE_COLUMN_GAP);
}

/**
 * The narrowest a column may get: wide enough for its longest word on one
 * line. A token too long to keep whole (a link, a path, a hash) breaks
 * wherever it must, so it only asks for a width that is comfortable to read.
 */
export function markdownTableWordWidth(cells: readonly string[]): number {
  let width = 0;
  for (const cell of cells) {
    for (const token of cell.replace(MARKDOWN_LINK_TARGET, ']').split(/\s+/)) {
      width = Math.max(
        width,
        token.length > TABLE_LONG_TOKEN_LENGTH
          ? MIN_LONG_TOKEN_COLUMN_WIDTH
          : token.length * TABLE_COLUMN_CHARACTER_WIDTH + TABLE_COLUMN_GAP,
      );
    }
  }
  return Math.min(MAX_TABLE_COLUMN_WIDTH, width);
}

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

export interface MarkdownTableLayout {
  /** Fitted tables show every column at once; scrolled ones have too many to read that way. */
  mode: 'fit' | 'scroll';
  widths: number[];
  overflow: number;
}

/**
 * A table is shown whole whenever each column can keep a readable width: at
 * its natural size when that fits, otherwise narrowed with the text wrapping
 * inside the cells, never below the column's longest word. Only a table with
 * more columns than the width can hold scrolls sideways.
 */
export function markdownTableLayout(input: {
  naturalWidths: readonly number[];
  wordWidths: readonly number[];
  containerWidth: number;
  paneWidth: number;
}): MarkdownTableLayout {
  const { naturalWidths, wordWidths, paneWidth } = input;
  const roomiest = Math.max(0, paneWidth - WIDE_TABLE_GUTTER * 2);
  const containerWidth = input.containerWidth > 0 ? input.containerWidth : roomiest;
  const widest = Math.max(containerWidth, roomiest);
  const total = (widths: readonly number[]) => widths.reduce((sum, width) => sum + width, 0);
  const natural = total(naturalWidths);
  if (natural <= widest) {
    return {
      mode: 'fit',
      widths: [...naturalWidths],
      overflow: wideTableOverflow({ tableWidth: natural, containerWidth, paneWidth }),
    };
  }

  const floors = naturalWidths.map((width, index) =>
    Math.min(width, Math.max(MIN_FITTED_COLUMN_WIDTH, wordWidths[index] ?? 0)),
  );
  const spare = widest - total(floors);
  if (spare >= 0) {
    const wanted = naturalWidths.map((width, index) => width - (floors[index] ?? 0));
    const wantedTotal = total(wanted);
    return {
      mode: 'fit',
      widths: floors.map((floor, index) =>
        wantedTotal > 0 ? floor + (spare * (wanted[index] ?? 0)) / wantedTotal : floor,
      ),
      overflow: widest - containerWidth,
    };
  }

  const widths = naturalWidths.map((width) => Math.max(width, MIN_SCROLLED_COLUMN_WIDTH));
  return {
    mode: 'scroll',
    widths,
    overflow: wideTableOverflow({ tableWidth: total(widths), containerWidth, paneWidth }),
  };
}
const FOOTNOTE_LINE_HEIGHT = 20;
const TASK_MARKER_SIZE = 16;
const listItemPattern = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))\s+(.+)$/;
const taskItemPattern = /^\[([ xX])\]\s+(.*)$/;
const quoteLinePattern = /^ {0,3}>[ \t]?/;
const footnoteDefinitionPattern = /^\[\^([^\]\s]+)\]:\s?(.*)$/;
const thematicBreakPattern = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const continuationIndentPattern = /^(?: {2,}|\t)\S/;
const fullLineImagePattern = /^!\[([^\]]*)\]\(\s*<?([^()<>\s]+)>?(?:\s+"[^"]*")?\s*\)$/;
const nestedBullets = ['\u2022', '\u25E6', '\u25AA\uFE0E'];

type ParsedListItem = {
  depth: number;
  marker: string;
  ordered: boolean;
  text: string;
  task: 'done' | 'open' | null;
};
type TableAlignment = 'left' | 'center' | 'right' | undefined;

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
  columnWordWidths,
  alignments,
  keyBase,
  renderColors,
  citations,
}: {
  rows: string[][];
  columnWidths: number[];
  columnWordWidths: number[];
  alignments: readonly TableAlignment[];
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
  const layout = markdownTableLayout({
    naturalWidths: columnWidths,
    wordWidths: columnWordWidths,
    containerWidth,
    paneWidth,
  });
  const fitted = layout.mode === 'fit';

  const cellStyle = (colIdx: number) => ({
    ...(fitted
      ? { flexGrow: layout.widths[colIdx] ?? 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }
      : { width: layout.widths[colIdx] }),
    paddingRight: colIdx < numCols - 1 ? TABLE_COLUMN_GAP : 0,
    paddingVertical: 8,
    justifyContent: 'center' as const,
  });

  const tableRows = (
    <>
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: renderColors.border,
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
                fontWeight: '600',
                lineHeight: 19,
                textAlign: alignments[colIdx] ?? 'left',
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
        <View
          key={`${keyBase}-tr-${rowIdx}`}
          style={{
            flexDirection: 'row',
            borderBottomWidth: rowIdx < sortedBody.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: renderColors.border,
          }}
        >
          {Array.from({ length: numCols }).map((_, colIdx) => (
            <View key={`${keyBase}-td-${rowIdx}-${colIdx}`} style={cellStyle(colIdx)}>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: renderColors.textSecondary,
                  fontWeight: '400',
                  lineHeight: 19,
                  textAlign: alignments[colIdx] ?? 'left',
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
    </>
  );
  const frameStyle = { marginVertical: 8, marginHorizontal: -layout.overflow / 2 };

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width)}
      testID="markdown-table-frame"
    >
      {fitted ? (
        <View style={frameStyle} testID="markdown-table">
          {tableRows}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={frameStyle}
          testID="markdown-table"
          contentContainerStyle={{ flexDirection: 'column' }}
        >
          {tableRows}
        </ScrollView>
      )}
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
    const line = lines[idx]!;
    const previous = items[items.length - 1];
    if (previous && !listItemPattern.test(line) && !thematicBreakPattern.test(line)) {
      const continuation =
        continuationIndentPattern.test(line) ||
        (line.trim() === '' &&
          continuationIndentPattern.test(lines[idx + 1] ?? '') &&
          !listItemPattern.test(lines[idx + 1] ?? ''));
      if (!continuation) break;
      if (line.trim()) previous.text += `\n${line.trim()}`;
      idx++;
      continue;
    }
    const match = line.match(listItemPattern);
    if (!match || thematicBreakPattern.test(line)) break;

    const indent = match[1]!.replace(/\t/g, '  ').length;
    while (indentStack.length > 0 && indent < indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }
    if (indentStack.length === 0 || indent > indentStack[indentStack.length - 1]!) {
      indentStack.push(indent);
    }

    const depth = indentStack.length - 1;
    const ordered = match[3] !== undefined;
    const task = ordered ? null : taskItemPattern.exec(match[5]!);
    items.push({
      depth,
      ordered,
      marker: ordered
        ? `${match[3]}${match[4]}`
        : nestedBullets[Math.min(depth, nestedBullets.length - 1)]!,
      text: task ? task[2]! : match[5]!,
      task: task ? (task[1] === ' ' ? 'open' : 'done') : null,
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

    const imageMatch = fullLineImagePattern.exec(restoreEscapes(line).trim());
    if (imageMatch) {
      nodes.push(
        <View key={`${keyBase}-img-${idx}`} style={{ marginVertical: 6 }}>
          <MarkdownImage src={imageMatch[2]!} alt={imageMatch[1]!.trim()} colors={renderColors} />
        </View>,
      );
      idx++;
      continue;
    }

    const headerMatch = line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]!.length;
      const headerText = headerMatch[2]!.replace(/\s+#+\s*$/, '');
      const sectionId = context.sectionId?.(headerText, level) ?? null;
      const onHeadingLayout = context.onHeadingLayout;
      const headingTypography =
        level === 1
          ? chatTypography.heading1
          : level === 2
            ? chatTypography.heading2
            : chatTypography.heading3;
      nodes.push(
        <Text
          key={`${keyBase}-h${level}-${idx}`}
          accessibilityRole="header"
          style={{
            ...headingTypography,
            color: renderColors.textPrimary,
            marginTop: 8,
            marginBottom: 4,
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
      const start = idx;
      const quoteLines: string[] = [];
      while (idx < lines.length && quoteLinePattern.test(lines[idx]!)) {
        quoteLines.push(lines[idx]!.replace(quoteLinePattern, ''));
        idx++;
      }
      nodes.push(
        <View
          key={`${keyBase}-bq-${start}`}
          testID="markdown-blockquote"
          style={{
            borderLeftWidth: 2,
            borderLeftColor: renderColors.border,
            paddingLeft: 12,
            marginVertical: 4,
          }}
        >
          {renderTextSegment(
            quoteLines.join('\n'),
            `${keyBase}-bq${start}`,
            { ...renderColors, textPrimary: renderColors.textSecondary },
            { citations },
          )}
        </View>,
      );
      continue;
    }

    if (footnoteDefinitionPattern.test(line)) {
      const start = idx;
      const notes: { label: string; text: string }[] = [];
      while (idx < lines.length) {
        const current = lines[idx]!;
        const definition = footnoteDefinitionPattern.exec(current);
        if (definition) {
          notes.push({ label: restoreEscapes(definition[1]!), text: definition[2]! });
        } else if (continuationIndentPattern.test(current) && notes.length > 0) {
          notes[notes.length - 1]!.text += `\n${current.trim()}`;
        } else if (!(
          current.trim() === '' && footnoteDefinitionPattern.test(lines[idx + 1] ?? '')
        )) {
          break;
        }
        idx++;
      }
      nodes.push(
        <View
          key={`${keyBase}-fn-${start}`}
          accessibilityLabel="Footnotes"
          style={{
            marginTop: 8,
            paddingTop: 8,
            gap: 4,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: renderColors.border,
          }}
        >
          {notes.map((note, i) => (
            <View key={`${keyBase}-fn-${start}-${i}`} style={{ flexDirection: 'row', gap: 6 }}>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  lineHeight: FOOTNOTE_LINE_HEIGHT,
                  color: renderColors.textSecondary,
                }}
              >{`${note.label}.`}</Text>
              <Text
                selectable
                style={{
                  fontSize: typeScale.footnote,
                  lineHeight: FOOTNOTE_LINE_HEIGHT,
                  flex: 1,
                  color: renderColors.textSecondary,
                }}
              >
                {renderInlineMarkdown(
                  note.text,
                  `${keyBase}-fnil-${start}-${i}`,
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

    if (thematicBreakPattern.test(line)) {
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
                <View
                  accessible
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.task === 'done', disabled: true }}
                  style={{
                    height: chatTypography.body.lineHeight,
                    justifyContent: 'center',
                  }}
                >
                  {item.task === 'done' ? (
                    <SquareCheck size={TASK_MARKER_SIZE} color={renderColors.textPrimary} />
                  ) : (
                    <Square size={TASK_MARKER_SIZE} color={renderColors.textSecondary} />
                  )}
                </View>
              ) : (
                <Text
                  style={{
                    ...chatTypography.body,
                    color: renderColors.textPrimary,
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
                  ...chatTypography.body,
                  color: renderColors.textPrimary,
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
          const alignments: TableAlignment[] = parseTableRow(separatorLine).map((cell) => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined;
          });

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
            const columns = Array.from({ length: numCols }, (_, colIdx) =>
              tableRows.map((row) => row[colIdx] ?? ''),
            );
            nodes.push(
              <MarkdownTable
                key={`${keyBase}-table-${idx}`}
                rows={tableRows}
                columnWidths={columns.map(markdownTableNaturalWidth)}
                columnWordWidths={columns.map(markdownTableWordWidth)}
                alignments={alignments}
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

    if (line.trim()) {
      nodes.push(
        <Text
          key={`${keyBase}-p-${idx}`}
          style={{ ...chatTypography.body, color: renderColors.textPrimary }}
          selectable
        >
          {renderInlineMarkdown(
            line.replace(/(?:\\| {2,})$/, ''),
            `${keyBase}-pil-${idx}`,
            renderColors,
            citations,
          )}
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
        <CodeBlockCopyButton code={codeContent} />
      </View>
      <CodeLinesScroller
        alwaysWrap={wrapsLongLines}
        showsIndicator
        style={{ paddingTop: 2, paddingBottom: 10, paddingHorizontal: 12 }}
      >
        {codeText}
      </CodeLinesScroller>
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
      if (canRenderAssistantSurface(classified)) {
        elements.push(
          <AssistantSurface
            key={`surface-${keyCounter++}`}
            fence={classified}
            colors={renderColors}
            onFollowUp={options.onFollowUp}
            streaming={!highlightCode}
            renderBody={(body) =>
              renderMarkdownContent(body, renderColors, {
                highlightCode,
                ...(options.onFollowUp ? { onFollowUp: options.onFollowUp } : {}),
              })
            }
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
