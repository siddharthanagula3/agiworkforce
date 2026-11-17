import { useMemo, useState } from 'react';
import { View, Alert, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { SideScroller } from './SideScroller';
import { MathBlock } from './MathBlock';
import { ReportChart } from './ReportChart';
import { MermaidDiagramBlock } from './MermaidDiagramBlock';
import { parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import { chatTypography, typeScale } from '@/src/ui/theme/tokens';
import {
  chartSpecFromFence,
  classifyAssistantFence,
  classifyStreamingFence,
  type AssistantFence,
} from '@agiworkforce/unified-chat/assistant-fence';
import { chartSpecToChart } from '@/src/features/chat/utils/chartArtifact';
import { extractSvgSlides } from '@agiworkforce/unified-chat/svg-gallery';
import { trustedImageKeys } from '@agiworkforce/unified-chat/markdown-image-sources';
import { restoreHyphenatedLabels } from '@agiworkforce/unified-chat/checklist-labels';
import { taskIndexAtOffset } from '@agiworkforce/unified-chat/task-list';
import { liftAnswerBadges } from '@agiworkforce/unified-chat/answer-surfaces';
import { textDirection } from '@agiworkforce/unified-chat/text-direction';
import { SvgGallery } from './SvgGallery';
import { AssistantSurface, canRenderAssistantSurface } from './AssistantSurface';
import type { CitationSource } from './CitationChip';
import {
  protectEscapes,
  renderInlineMarkdown,
  restoreEscapes,
  type InlineFootnotes,
  type InlineRenderOptions,
} from './MarkdownInline';
import { MarkdownImage } from './MarkdownImage';
import {
  CONTINUATION_INDENT_LINE,
  FOOTNOTE_DEFINITION_LINE,
  HEADING_LINE,
  LIST_ITEM_LINE,
  QUOTE_LINE,
  THEMATIC_BREAK_LINE,
  closesFence,
  collectDetails,
  collectDisplayMath,
  collectFencedCode,
  collectFootnoteDefinitions,
  collectIndentedCode,
  referencedFootnotes,
  dedentColumns,
  isOpenImageTail,
  proseLines,
  setextHeadingLevel,
  isIndentedCodeLine,
  isMathFenceLanguage,
  opensDisplayMath,
  prepareMarkdownSource,
  readFenceOpen,
  splitParagraphImages,
  type FencedCode,
} from './markdownBlockSyntax';
import { MarkdownDetails } from './MarkdownDetails';
import { StudyDocumentView, studyFenceContent } from './artifact-viewers/study';
import {
  collectLinkDefinitions,
  footnoteNumber,
  inlinePlainText,
  readLinkDefinition,
} from '@/src/features/chat/utils/markdownInlineSyntax';
import { dropHiddenHtmlBlocks } from '@/src/features/chat/utils/markdownHiddenHtml';
import { holdStreamingCitationLink } from '@/src/features/chat/utils/streamingCitationLink';
import {
  drawnInlineMath,
  isTableDelimiterRow,
  readTable,
  splitTableRow,
  tableCellHasLink,
} from '@/src/features/chat/utils/markdownTableRows';
import { createReportSectionIds } from '@/src/features/research/reportSections';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Square,
  SquareCheck,
  TriangleAlert,
} from 'lucide-react-native';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import {
  markdownTableToCsv,
  markdownTableToTsv,
  tableCellPlainText,
} from '@/src/features/chat/utils/tableCsv';
import {
  COPY_FAILED_LABEL,
  useCopyAction,
  type CopyStatus,
} from '@/src/shared/hooks/useCopyAction';
import { TableFullScreen } from './TableFullScreen';
import { CodeCard } from './CodeCard';
import {
  isNumericCell,
  nextTabularSort,
  sortTabularRows,
  type TabularSort,
} from '@agiworkforce/unified-chat/tabular';

export { codeDownloadFile } from './CodeCard';

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

export function scaleColumnWidth(width: number, fontScale: number): number {
  return Math.min(
    MAX_TABLE_COLUMN_WIDTH * Math.max(1, fontScale),
    Math.max(width, width * fontScale),
  );
}

export function scaleWordWidth(width: number, fontScale: number, paneWidth: number): number {
  const room = paneWidth > 0 ? Math.max(0, paneWidth - WIDE_TABLE_GUTTER * 2) : Infinity;
  return Math.min(room, Math.max(width, width * fontScale));
}

function holdsWordWiderThan(
  room: number,
  wordWidths: readonly number[],
  fontScale: number,
): boolean {
  return wordWidths.some(
    (width) => width !== MIN_LONG_TOKEN_COLUMN_WIDTH && Math.max(width, width * fontScale) > room,
  );
}

function clampTableColumnWidth(width: number): number {
  return Math.min(MAX_TABLE_COLUMN_WIDTH, Math.max(MIN_TABLE_COLUMN_WIDTH, width));
}

export function markdownTableNaturalWidth(cells: readonly string[]): number {
  const longestCell = cells.reduce(
    (longest, cell) => Math.max(longest, drawnInlineMath(cell).length),
    0,
  );
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
    for (const token of drawnInlineMath(cell).replace(MARKDOWN_LINK_TARGET, ']').split(/\s+/)) {
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

function scaledTableWidths(input: {
  naturalWidths: readonly number[];
  wordWidths: readonly number[];
  paneWidth: number;
  fontScale?: number;
}): { naturalWidths: number[]; wordWidths: number[] } {
  const fontScale = input.fontScale ?? 1;
  return {
    naturalWidths: input.naturalWidths.map((width) => scaleColumnWidth(width, fontScale)),
    wordWidths: input.wordWidths.map((width) => scaleWordWidth(width, fontScale, input.paneWidth)),
  };
}

function scrolledTableWidths(
  naturalWidths: readonly number[],
  wordWidths: readonly number[],
): number[] {
  return naturalWidths.map((width, index) =>
    Math.max(width, wordWidths[index] ?? 0, MIN_SCROLLED_COLUMN_WIDTH),
  );
}

export function markdownTableScrollWidths(input: {
  naturalWidths: readonly number[];
  wordWidths: readonly number[];
  paneWidth: number;
  fontScale?: number;
}): number[] {
  const { naturalWidths, wordWidths } = scaledTableWidths(input);
  return scrolledTableWidths(naturalWidths, wordWidths);
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
  fontScale?: number;
}): MarkdownTableLayout {
  const { paneWidth } = input;
  const { naturalWidths, wordWidths } = scaledTableWidths(input);
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
  if (spare >= 0 && !holdsWordWiderThan(widest, input.wordWidths, input.fontScale ?? 1)) {
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

  const widths = scrolledTableWidths(naturalWidths, wordWidths);
  return {
    mode: 'scroll',
    widths,
    overflow: wideTableOverflow({ tableWidth: total(widths), containerWidth, paneWidth }),
  };
}
const FOOTNOTE_LINE_HEIGHT = 20;
const ORDERED_MARKER_MIN_WIDTH = 18;
const BULLET_MARKER_WIDTH = 12;
const TASK_MARKER_SIZE = 16;
const listItemPattern = LIST_ITEM_LINE;
const taskItemPattern = /^\[([ xX])\]\s+(.*)$/;
const quoteLinePattern = QUOTE_LINE;
const footnoteDefinitionPattern = FOOTNOTE_DEFINITION_LINE;
const thematicBreakPattern = THEMATIC_BREAK_LINE;
const continuationIndentPattern = CONTINUATION_INDENT_LINE;
const fullLineImagePattern = /^!\[([^\]]*)\]\(\s*<?([^()<>\s]+)>?(?:\s+"([^"]*)")?\s*\)$/;
const nestedBullets = ['\u2022', '\u25E6', '\u25AA\uFE0E'];

type ParsedListItem = {
  depth: number;
  marker: string;
  ordered: boolean;
  text: string;
  task: 'done' | 'open' | null;
  contentColumn: number;
  line: number;
  body: string[];
  blocks: boolean;
};
type TableAlignment = 'left' | 'center' | 'right' | undefined;

const TABLE_HEADER_TOUCH_HEIGHT = 44;
const TABLE_ACTION_ICON_SIZE = 16;
const TABLE_ACTION_HIT_SLOP = 12;
const TABLE_ROW_LINE_HEIGHT = 19;

const SORT_DIRECTION_WORD = { asc: 'ascending', desc: 'descending' } as const;

export function sortTableRows(body: readonly string[][], sort: TabularSort): readonly string[][] {
  if (!sort) return body;
  const keys = body.map((row) => [tableCellPlainText(row[sort.column] ?? '')]);
  const original = new Map(keys.map((key, index) => [key, body[index]!]));
  const values = keys.map((key) => key[0]!.trim()).filter((value) => value !== '');
  const sorted = sortTabularRows(
    {
      columns: [''],
      rows: keys,
      numericColumns: [values.length > 0 && values.every(isNumericCell)],
      source: 'delimited',
    },
    { column: 0, direction: sort.direction },
  );
  return sorted.map((key) => original.get(key)!);
}

function tableCopyLabel(status: CopyStatus): string {
  if (status === 'copied') return 'Table copied';
  if (status === 'failed') return COPY_FAILED_LABEL;
  return 'Copy table';
}

const TABLE_ACTION_STYLE = {
  padding: 4,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

function TableActions({
  onCopy,
  onDownload,
  copyStatus,
  colors,
  children,
}: {
  onCopy: () => void;
  onDownload: () => void;
  copyStatus: CopyStatus;
  colors: ColorScheme;
  children?: React.ReactNode;
}) {
  const CopyIcon = copyStatus === 'copied' ? Check : copyStatus === 'failed' ? TriangleAlert : Copy;
  const iconColor =
    copyStatus === 'copied'
      ? colors.agentSuccess
      : copyStatus === 'failed'
        ? colors.agentError
        : colors.textSecondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Pressable
        onPress={onCopy}
        hitSlop={TABLE_ACTION_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={tableCopyLabel(copyStatus)}
        accessibilityLiveRegion="polite"
        style={TABLE_ACTION_STYLE}
      >
        <CopyIcon size={TABLE_ACTION_ICON_SIZE} color={iconColor} />
      </Pressable>
      <Pressable
        onPress={onDownload}
        hitSlop={TABLE_ACTION_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Download table as CSV"
        style={TABLE_ACTION_STYLE}
      >
        <Download size={TABLE_ACTION_ICON_SIZE} color={colors.textSecondary} />
      </Pressable>
      {children}
    </View>
  );
}

function MarkdownTable({
  rows,
  columnWidths,
  columnWordWidths,
  alignments,
  keyBase,
  renderColors,
  citations,
  footnotes,
  inlineOptions,
  selectable,
}: {
  rows: string[][];
  columnWidths: number[];
  columnWordWidths: number[];
  alignments: readonly TableAlignment[];
  keyBase: string;
  renderColors: ColorScheme;
  citations: readonly CitationSource[];
  footnotes: InlineFootnotes;
  inlineOptions: InlineRenderOptions;
  selectable: boolean;
}) {
  const [sort, setSort] = useState<TabularSort>(null);
  const [expanded, setExpanded] = useState(false);
  const { status: copyStatus, copy } = useCopyAction();
  const [header = [], ...body] = rows;
  const numCols = columnWidths.length;
  const sortedBody = useMemo(() => sortTableRows(body, sort), [body, sort]);
  const sortable = body.length > 1;
  const inlineParse = useMemo(
    () => ({
      linkDefinitions: inlineOptions.linkDefinitions,
      citationCount: inlineOptions.linkifyNumericCitations === false ? 0 : citations.length,
    }),
    [inlineOptions.linkDefinitions, inlineOptions.linkifyNumericCitations, citations.length],
  );
  const { contentWidth: paneWidth } = useResponsiveLayout();
  const { fontScale } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const layout = markdownTableLayout({
    naturalWidths: columnWidths,
    wordWidths: columnWordWidths,
    containerWidth,
    paneWidth,
    fontScale,
  });
  const displayed = [header, ...sortedBody];

  const copyTable = () => {
    void copy(markdownTableToTsv(displayed));
  };
  const downloadTable = () => {
    void exportSourceFile(markdownTableToCsv(displayed), 'table', 'csv')
      .then((result) => shareFile(result.uri))
      .catch(() => {
        Alert.alert('Download failed', 'Could not save this table as CSV. Try again.');
      });
  };

  const renderRows = (fitted: boolean, widths: readonly number[], rowKey: string) => {
    const cellStyle = (colIdx: number) => ({
      ...(fitted
        ? {
            flexGrow: widths[colIdx] ?? 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
          }
        : { width: widths[colIdx] }),
      paddingRight: colIdx < numCols - 1 ? TABLE_COLUMN_GAP : 0,
      paddingVertical: 8,
      justifyContent: 'flex-start' as const,
    });
    return (
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
            const plainLabel = tableCellPlainText(label);
            const active = sort?.column === colIdx ? SORT_DIRECTION_WORD[sort.direction] : null;
            const upcoming = nextTabularSort(sort, colIdx);
            const content = (
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: renderColors.textPrimary,
                  fontWeight: '600',
                  lineHeight: TABLE_ROW_LINE_HEIGHT,
                  textAlign: alignments[colIdx] ?? 'left',
                }}
              >
                {renderInlineMarkdown(
                  label,
                  `${rowKey}-th-${colIdx}`,
                  renderColors,
                  citations,
                  footnotes,
                  inlineOptions,
                )}
                {active ? (active === 'ascending' ? ' ↑' : ' ↓') : ''}
              </Text>
            );
            return sortable && !tableCellHasLink(label, inlineParse) ? (
              <Pressable
                key={`${rowKey}-th-${colIdx}`}
                style={{
                  ...cellStyle(colIdx),
                  minHeight: TABLE_HEADER_TOUCH_HEIGHT,
                }}
                onPress={() => setSort(upcoming)}
                accessibilityRole="button"
                accessibilityLabel={`${plainLabel}${active ? `, sorted ${active}` : ''}`}
                accessibilityHint={
                  upcoming
                    ? `Sorts the table by this column, ${SORT_DIRECTION_WORD[upcoming.direction]}`
                    : 'Restores the original order'
                }
              >
                {content}
              </Pressable>
            ) : (
              <View key={`${rowKey}-th-${colIdx}`} style={cellStyle(colIdx)}>
                {content}
              </View>
            );
          })}
        </View>
        {sortedBody.map((row, rowIdx) => (
          <View
            key={`${rowKey}-tr-${rowIdx}`}
            style={{
              flexDirection: 'row',
              borderBottomWidth: rowIdx < sortedBody.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: renderColors.border,
            }}
          >
            {Array.from({ length: numCols }).map((_, colIdx) => (
              <View key={`${rowKey}-td-${rowIdx}-${colIdx}`} style={cellStyle(colIdx)}>
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    color: renderColors.textSecondary,
                    fontWeight: '400',
                    lineHeight: TABLE_ROW_LINE_HEIGHT,
                    textAlign: alignments[colIdx] ?? 'left',
                  }}
                  selectable={selectable}
                >
                  {renderInlineMarkdown(
                    row[colIdx] || '',
                    `${rowKey}-tdil-${rowIdx}-${colIdx}`,
                    renderColors,
                    citations,
                    footnotes,
                    inlineOptions,
                  )}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </>
    );
  };

  const tableRows = renderRows(layout.mode === 'fit', layout.widths, keyBase);
  const frameStyle = {
    marginVertical: 8,
    marginHorizontal: -layout.overflow / 2,
  };

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width)}
      testID="markdown-table-frame"
    >
      {layout.mode === 'fit' ? (
        <View style={frameStyle} testID="markdown-table">
          {tableRows}
        </View>
      ) : (
        <SideScroller
          showsHorizontalScrollIndicator
          style={frameStyle}
          testID="markdown-table"
          contentContainerStyle={{ flexDirection: 'column' }}
        >
          {tableRows}
        </SideScroller>
      )}
      <View style={{ alignSelf: 'flex-end', padding: 4 }}>
        <TableActions
          onCopy={copyTable}
          onDownload={downloadTable}
          copyStatus={copyStatus}
          colors={renderColors}
        >
          <Pressable
            onPress={() => setExpanded(true)}
            hitSlop={TABLE_ACTION_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Expand table"
            style={TABLE_ACTION_STYLE}
          >
            <Maximize2 size={TABLE_ACTION_ICON_SIZE} color={renderColors.textSecondary} />
          </Pressable>
        </TableActions>
      </View>
      {expanded ? (
        <TableFullScreen
          visible
          onClose={() => setExpanded(false)}
          colors={renderColors}
          actions={
            <View style={{ paddingRight: 12 }}>
              <TableActions
                onCopy={copyTable}
                onDownload={downloadTable}
                copyStatus={copyStatus}
                colors={renderColors}
              />
            </View>
          }
        >
          {renderRows(
            false,
            markdownTableScrollWidths({
              naturalWidths: columnWidths,
              wordWidths: columnWordWidths,
              paneWidth,
              fontScale,
            }),
            `${keyBase}-full`,
          )}
        </TableFullScreen>
      ) : null}
    </View>
  );
}
const RIGHT_TO_LEFT_TEXT_STYLE = { writingDirection: 'rtl', textAlign: 'right' } as const;

function isRightToLeft(text: string): boolean {
  return textDirection(text) === 'rtl';
}

function directionStyle(text: string): typeof RIGHT_TO_LEFT_TEXT_STYLE | null {
  return isRightToLeft(text) ? RIGHT_TO_LEFT_TEXT_STYLE : null;
}

const TASK_TOGGLE_TARGET = 44;

function taskToggleHitSlop(extent: number): number {
  return Math.max(0, Math.ceil((TASK_TOGGLE_TARGET - extent) / 2));
}

function ListMarker({
  marker,
  ordered,
  colors,
}: {
  marker: string;
  ordered: boolean;
  colors: ColorScheme;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      style={{
        ...chatTypography.body,
        color: colors.textPrimary,
        ...(ordered
          ? { minWidth: ORDERED_MARKER_MIN_WIDTH * fontScale, textAlign: 'right' as const }
          : { width: BULLET_MARKER_WIDTH * fontScale, textAlign: 'center' as const }),
      }}
    >
      {marker}
    </Text>
  );
}

function TaskMarker({
  done,
  label,
  taskIndex,
  onToggle,
  colors,
}: {
  done: boolean;
  label: string;
  taskIndex: number;
  onToggle: ((taskIndex: number) => void) | undefined;
  colors: ColorScheme;
}) {
  const { fontScale } = useWindowDimensions();
  const iconSize = Math.round(TASK_MARKER_SIZE * fontScale);
  const icon = done ? (
    <SquareCheck size={iconSize} color={colors.textPrimary} />
  ) : (
    <Square size={iconSize} color={colors.textSecondary} />
  );
  const frameHeight = chatTypography.body.lineHeight * fontScale;
  const frame = { height: frameHeight, justifyContent: 'center' as const };
  if (onToggle && taskIndex >= 0) {
    return (
      <Pressable
        onPress={() => onToggle(taskIndex)}
        hitSlop={{
          left: taskToggleHitSlop(iconSize),
          right: taskToggleHitSlop(iconSize),
          top: taskToggleHitSlop(frameHeight),
          bottom: taskToggleHitSlop(frameHeight),
        }}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: done }}
        style={frame}
      >
        {icon}
      </Pressable>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: done, disabled: true }}
      style={frame}
    >
      {icon}
    </View>
  );
}

function collectListItems(
  lines: string[],
  start: number,
): { items: ParsedListItem[]; next: number } {
  const items: ParsedListItem[] = [];
  const indentStack: number[] = [];
  const numbering = new Map<number, { next: number; delimiter: string }>();
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
      const dedented = dedentColumns(line, previous.contentColumn);
      const fence = readFenceOpen(dedented);
      if (fence) {
        const bodyLines = [dedented];
        idx++;
        while (idx < lines.length) {
          const fenced = dedentColumns(lines[idx]!, previous.contentColumn);
          if (lines[idx]!.trim() !== '' && !continuationIndentPattern.test(lines[idx]!)) break;
          bodyLines.push(fenced);
          idx++;
          if (closesFence(fenced, fence)) break;
        }
        previous.body.push(...bodyLines);
        previous.blocks = true;
        continue;
      }
      if (line.trim()) previous.text += `\n${line.trim()}`;
      previous.body.push(dedented);
      if (opensBlockInsideItem(previous.body)) previous.blocks = true;
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
    for (const level of [...numbering.keys()]) {
      if (level > depth || (level === depth && !ordered)) numbering.delete(level);
    }
    const sibling = ordered ? numbering.get(depth) : undefined;
    const number = sibling && sibling.delimiter === match[4] ? sibling.next : Number(match[3] ?? 0);
    if (ordered) numbering.set(depth, { next: number + 1, delimiter: match[4]! });
    const task = taskItemPattern.exec(match[5]!);
    const text = task ? task[2]! : match[5]!;
    items.push({
      depth,
      ordered,
      marker: ordered
        ? `${number}${match[4]}`
        : nestedBullets[Math.min(depth, nestedBullets.length - 1)]!,
      text,
      task: task ? (task[1] === ' ' ? 'open' : 'done') : null,
      contentColumn: line.length - match[5]!.length,
      line: idx,
      body: [text],
      blocks: readFenceOpen(text) !== null || opensDisplayMath(text),
    });
    idx++;
  }

  return { items, next: idx };
}

function opensBlockInsideItem(body: readonly string[]): boolean {
  const last = body[body.length - 1] ?? '';
  const previous = body[body.length - 2];
  return (
    opensDisplayMath(last) ||
    quoteLinePattern.test(last) ||
    (previous !== undefined &&
      previous.includes('|') &&
      isTableDelimiterRow(last, splitTableRow(previous).length))
  );
}

interface TaskToggleTarget {
  readonly source: string;
  readonly lineStarts: readonly number[];
  readonly onToggle: (taskIndex: number) => void;
}

interface SegmentContext {
  citations: readonly CitationSource[];
  footnotes: InlineFootnotes;
  inlineOptions: InlineRenderOptions;
  trustedImages: ReadonlySet<string>;
  selectable?: boolean;
  sectionId?: (heading: string, level: number) => string | null;
  onHeadingLayout?: (id: string, y: number) => void;
  highlightCode: boolean;
  streaming: boolean;
  stopped: boolean;
  capCode: boolean;
  onFollowUp?: (text: string) => void;
  taskToggle?: TaskToggleTarget;
  lineBase: number;
  gatherFootnotes?: boolean;
}

function nestedContext(context: SegmentContext, lineBase: number | null = null): SegmentContext {
  return {
    citations: context.citations,
    footnotes: context.footnotes,
    inlineOptions: context.inlineOptions,
    trustedImages: context.trustedImages,
    selectable: context.selectable,
    highlightCode: context.highlightCode,
    streaming: context.streaming,
    stopped: context.stopped,
    capCode: context.capCode,
    ...(context.onFollowUp ? { onFollowUp: context.onFollowUp } : {}),
    ...(context.taskToggle && lineBase !== null ? { taskToggle: context.taskToggle } : {}),
    lineBase: lineBase ?? 0,
  };
}

function toggleableTaskIndex(context: SegmentContext, line: number): number {
  const target = context.taskToggle;
  if (!target) return -1;
  const offset = target.lineStarts[context.lineBase + line];
  return offset === undefined ? -1 : taskIndexAtOffset(target.source, offset);
}

function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let index = source.indexOf('\n'); index >= 0; index = source.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function renderFootnoteSection(
  notes: readonly { label: string; text: string }[],
  key: string,
  renderColors: ColorScheme,
  context: SegmentContext,
): React.ReactElement {
  const order = Object.keys(context.footnotes);
  return (
    <View
      key={key}
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
        <View key={`${key}-${i}`} style={{ flexDirection: 'row', gap: 6 }}>
          <Text
            style={{
              fontSize: typeScale.footnote,
              lineHeight: FOOTNOTE_LINE_HEIGHT,
              color: renderColors.textSecondary,
            }}
          >{`${footnoteNumber(note.label, order)}.`}</Text>
          <Text
            selectable={context.selectable !== false}
            style={{
              fontSize: typeScale.footnote,
              lineHeight: FOOTNOTE_LINE_HEIGHT,
              flex: 1,
              color: renderColors.textSecondary,
            }}
          >
            {renderInlineMarkdown(
              note.text,
              `${key}-il-${i}`,
              renderColors,
              context.citations,
              context.footnotes,
              context.inlineOptions,
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

const HARD_BREAK_BACKSLASH = /\\$/;

function continuesParagraphAt(
  lines: readonly string[],
  rawLines: readonly string[],
  at: number,
  streaming: boolean,
): boolean {
  const line = lines[at]!;
  const raw = rawLines[at]!;
  if (line.trim() === '') return false;
  if (readFenceOpen(raw) || opensDisplayMath(raw)) return false;
  if (
    HEADING_LINE.test(line) ||
    quoteLinePattern.test(line) ||
    footnoteDefinitionPattern.test(line) ||
    thematicBreakPattern.test(line) ||
    listItemPattern.test(line)
  ) {
    return false;
  }
  if (fullLineImagePattern.test(restoreEscapes(line).trim())) return false;
  if (streaming && at === lines.length - 1 && isOpenImageTail(line)) return false;
  if (collectDetails(rawLines, at) || readTable(lines, at)) return false;
  const underlineStillStreaming = streaming && at + 2 === lines.length;
  return underlineStillStreaming || setextHeadingLevel(line, lines[at + 1]) === 0;
}

function quoteEndsInParagraph(quoteLines: readonly string[]): boolean {
  const last = proseLines(quoteLines.join('\n')).at(-1) ?? '';
  return last.trim() !== '' && !HEADING_LINE.test(last) && !thematicBreakPattern.test(last);
}

function renderTextSegment(
  text: string,
  keyBase: string,
  renderColors: ColorScheme,
  context: SegmentContext,
): React.ReactNode[] {
  const { citations, footnotes, inlineOptions } = context;
  const nodes: React.ReactNode[] = [];
  const rawLines = text.split('\n');
  const lines = rawLines.map(protectEscapes);
  let idx = 0;
  let paragraphOpen = false;
  let lastContentLine = lines.length - 1;
  while (lastContentLine >= 0 && lines[lastContentLine]!.trim() === '') lastContentLine--;

  while (idx < lines.length) {
    const line = lines[idx]!;
    const continuesParagraph = paragraphOpen;
    paragraphOpen = false;

    const fence = readFenceOpen(rawLines[idx]!);
    if (fence) {
      const fenced = collectFencedCode(rawLines, idx, fence);
      nodes.push(renderFencedBlock(`${keyBase}-fence-${idx}`, fenced, renderColors, context));
      idx = fenced.next;
      continue;
    }

    if (opensDisplayMath(rawLines[idx]!)) {
      const math = collectDisplayMath(rawLines, idx);
      nodes.push(
        renderDisplayMath(`${keyBase}-math-${idx}`, math.tex, math.closed, renderColors, context),
      );
      idx = math.next;
      continue;
    }

    if (!continuesParagraph && isIndentedCodeLine(rawLines[idx]!)) {
      const indented = collectIndentedCode(rawLines, idx);
      nodes.push(
        renderCodeCard(
          `${keyBase}-icode-${idx}`,
          indented.body,
          undefined,
          context.highlightCode,
          context.streaming,
          false,
          renderColors,
          context.selectable !== false,
          context.capCode,
        ),
      );
      idx = indented.next;
      continue;
    }

    if (!continuesParagraph && readLinkDefinition(rawLines[idx]!)) {
      idx++;
      continue;
    }

    const details = collectDetails(rawLines, idx);
    if (details) {
      nodes.push(
        <MarkdownDetails
          key={`${keyBase}-details-${idx}`}
          summary={renderInlineMarkdown(
            details.summary,
            `${keyBase}-dsil-${idx}`,
            renderColors,
            citations,
            footnotes,
            inlineOptions,
          )}
          summaryText={inlinePlainText(details.summary)}
          initiallyOpen={details.initiallyOpen}
          colors={renderColors}
        >
          {renderTextSegment(
            details.body,
            `${keyBase}-ds${idx}`,
            renderColors,
            nestedContext(context),
          )}
        </MarkdownDetails>,
      );
      idx = details.next;
      continue;
    }

    const imageMatch = fullLineImagePattern.exec(restoreEscapes(line).trim());
    if (imageMatch) {
      nodes.push(
        <View key={`${keyBase}-img-${idx}`} style={{ marginVertical: 6 }}>
          <MarkdownImage
            src={imageMatch[2]!}
            alt={imageMatch[1]!.trim()}
            {...(imageMatch[3]?.trim() ? { title: imageMatch[3].trim() } : {})}
            colors={renderColors}
            trustedImageKeys={context.trustedImages}
          />
        </View>,
      );
      idx++;
      continue;
    }

    if (context.streaming && idx === lines.length - 1 && isOpenImageTail(line)) {
      idx++;
      continue;
    }

    const headerMatch = line.match(HEADING_LINE);
    const underlineStillStreaming = context.streaming && idx + 2 === lines.length;
    const setextLevel =
      headerMatch || underlineStillStreaming ? 0 : setextHeadingLevel(line, lines[idx + 1]);
    if (headerMatch || setextLevel > 0) {
      const level = headerMatch ? headerMatch[1]!.length : setextLevel;
      const headerText = headerMatch ? headerMatch[2]!.replace(/\s+#+\s*$/, '') : line.trim();
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
            ...directionStyle(headerText),
          }}
          selectable={context.selectable !== false}
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
            footnotes,
            inlineOptions,
          )}
        </Text>,
      );
      idx += headerMatch ? 1 : 2;
      continue;
    }

    if (quoteLinePattern.test(line)) {
      const start = idx;
      const quoteLines: string[] = [];
      while (idx < lines.length) {
        if (quoteLinePattern.test(lines[idx]!)) {
          quoteLines.push(lines[idx]!.replace(quoteLinePattern, ''));
        } else if (
          quoteEndsInParagraph(quoteLines) &&
          continuesParagraphAt(lines, rawLines, idx, context.streaming)
        ) {
          quoteLines.push(lines[idx]!.trimStart());
        } else {
          break;
        }
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
            restoreEscapes(quoteLines.join('\n'), true),
            `${keyBase}-bq${start}`,
            { ...renderColors, textPrimary: renderColors.textSecondary },
            nestedContext(context),
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
      const drawnHere = context.gatherFootnotes
        ? []
        : notes.filter((note) => !Object.hasOwn(context.footnotes, note.label));
      if (drawnHere.length > 0) {
        nodes.push(
          renderFootnoteSection(drawnHere, `${keyBase}-fn-${start}`, renderColors, context),
        );
      }
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
      const start = idx;
      const { items, next } = collectListItems(lines, idx);
      idx = next;
      nodes.push(
        <View key={`${keyBase}-list-${start}`} style={{ marginVertical: 4, gap: 2 }}>
          {items.map((item, i) => (
            <View
              key={`${keyBase}-li-${start}-${i}`}
              testID={isRightToLeft(item.text) ? 'markdown-list-item-rtl' : undefined}
              style={
                isRightToLeft(item.text)
                  ? { flexDirection: 'row-reverse', gap: 8, paddingRight: 4 + item.depth * 16 }
                  : { flexDirection: 'row', gap: 8, paddingLeft: 4 + item.depth * 16 }
              }
            >
              {item.task && !item.ordered ? (
                <TaskMarker
                  done={item.task === 'done'}
                  label={inlinePlainText(item.text)}
                  taskIndex={toggleableTaskIndex(context, item.line)}
                  onToggle={context.taskToggle?.onToggle}
                  colors={renderColors}
                />
              ) : (
                <ListMarker marker={item.marker} ordered={item.ordered} colors={renderColors} />
              )}
              {item.task && item.ordered ? (
                <TaskMarker
                  done={item.task === 'done'}
                  label={inlinePlainText(item.text)}
                  taskIndex={toggleableTaskIndex(context, item.line)}
                  onToggle={context.taskToggle?.onToggle}
                  colors={renderColors}
                />
              ) : null}
              {item.blocks ? (
                <View style={{ flex: 1, minWidth: 0 }} testID="markdown-list-item-blocks">
                  {renderTextSegment(
                    restoreEscapes(item.body.join('\n'), true),
                    `${keyBase}-lib-${start}-${i}`,
                    renderColors,
                    nestedContext(context, context.lineBase + item.line),
                  )}
                </View>
              ) : (
                <Text
                  style={{
                    ...chatTypography.body,
                    color: renderColors.textPrimary,
                    flex: 1,
                    ...directionStyle(item.text),
                  }}
                  selectable={context.selectable !== false}
                >
                  {renderInlineMarkdown(
                    item.text,
                    `${keyBase}-liil-${start}-${i}`,
                    renderColors,
                    citations,
                    footnotes,
                    inlineOptions,
                  )}
                </Text>
              )}
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const table = readTable(lines, idx);
    if (table) {
      const tableStart = idx;
      const tableRows = table.rows.map((row) => [...row]);
      const headerRow = tableRows[0]!;
      const alignments: TableAlignment[] = splitTableRow(lines[idx + 1]!).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined;
      });
      idx = table.next;

      const numCols = headerRow.length;
      const columns = Array.from({ length: numCols }, (_, colIdx) =>
        tableRows.map((row) => row[colIdx] ?? ''),
      );
      nodes.push(
        <MarkdownTable
          key={`${keyBase}-table-${tableStart}`}
          rows={tableRows}
          columnWidths={columns.map(markdownTableNaturalWidth)}
          columnWordWidths={columns.map(markdownTableWordWidth)}
          alignments={alignments}
          keyBase={`${keyBase}-t${tableStart}`}
          renderColors={renderColors}
          citations={citations}
          footnotes={footnotes}
          inlineOptions={inlineOptions}
          selectable={context.selectable !== false}
        />,
      );
      continue;
    }

    if (line.trim()) {
      let end = idx + 1;
      while (end < lines.length && continuesParagraphAt(lines, rawLines, end, context.streaming)) {
        end++;
      }
      const paragraph = lines
        .slice(idx, end)
        .map((paragraphLine) => paragraphLine.trim().replace(HARD_BREAK_BACKSLASH, ''))
        .join('\n');
      const pieces = splitParagraphImages(paragraph) ?? [
        { kind: 'text' as const, text: paragraph },
      ];
      pieces.forEach((piece, pieceIdx) => {
        nodes.push(
          piece.kind === 'image' ? (
            <View key={`${keyBase}-pimg-${idx}-${pieceIdx}`} style={{ marginVertical: 6 }}>
              <MarkdownImage
                src={restoreEscapes(piece.src)}
                alt={restoreEscapes(piece.alt)}
                {...(piece.title ? { title: restoreEscapes(piece.title) } : {})}
                colors={renderColors}
                trustedImageKeys={context.trustedImages}
              />
            </View>
          ) : (
            <Text
              key={`${keyBase}-p-${idx}-${pieceIdx}`}
              style={{
                ...chatTypography.body,
                color: renderColors.textPrimary,
                ...directionStyle(piece.text),
              }}
              selectable={context.selectable !== false}
            >
              {renderInlineMarkdown(
                piece.text,
                `${keyBase}-pil-${idx}-${pieceIdx}`,
                renderColors,
                citations,
                footnotes,
                inlineOptions,
              )}
            </Text>
          ),
        );
      });
      paragraphOpen = true;
      idx = end;
      continue;
    } else if (idx > 0 && idx < lastContentLine && lines[idx - 1]!.trim() !== '') {
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
  streaming: boolean,
  fenceClosed: boolean,
  renderColors: ColorScheme,
  selectable: boolean,
  capCode: boolean,
): React.ReactElement {
  return (
    <CodeCard
      key={key}
      blockKey={key}
      codeContent={codeContent}
      fenceLanguage={fenceLanguage}
      highlightCode={highlightCode}
      streaming={streaming}
      fenceClosed={fenceClosed}
      renderColors={renderColors}
      selectable={selectable}
      capCode={capCode}
    />
  );
}

function renderDisplayMath(
  key: string,
  tex: string,
  closed: boolean,
  renderColors: ColorScheme,
  context: SegmentContext,
): React.ReactElement {
  if (!closed && context.streaming) {
    return (
      <View
        key={key}
        testID="markdown-math-pending"
        accessible
        accessibilityLabel="Equation in progress"
        style={{ minHeight: chatTypography.body.lineHeight, marginVertical: 6 }}
      />
    );
  }
  return <MathBlock key={key} latex={tex} display={true} color={renderColors.textPrimary} />;
}

function classifySettledFence(
  language: string,
  body: string,
  closed: boolean,
  streaming: boolean,
  stopped: boolean,
): AssistantFence | null {
  const source = body.trim();
  if (streaming || (stopped && !closed)) return classifyStreamingFence(language, source, closed);
  const classified = classifyAssistantFence(language, source);
  return closed || classified.kind !== 'fallback' || classified.reason !== 'invalid'
    ? classified
    : null;
}

const FENCE_LANGUAGE_NAME = /^[\w+#.-]+/;

function renderFencedBlock(
  key: string,
  fenced: FencedCode,
  renderColors: ColorScheme,
  context: SegmentContext,
): React.ReactNode {
  const { body } = fenced;
  const fenceLanguage = FENCE_LANGUAGE_NAME.exec(fenced.fence.language)?.[0] ?? '';
  const { highlightCode } = context;
  const selectable = context.selectable !== false;
  if (isMathFenceLanguage(fenceLanguage)) {
    return renderDisplayMath(key, body.trim(), fenced.closed, renderColors, context);
  }
  const study = studyFenceContent(fenceLanguage, body);
  if (study !== null) {
    return (
      <StudyDocumentView
        key={key}
        content={study}
        streaming={context.streaming}
        renderMarkdown={(text) =>
          renderMarkdownContent(text, renderColors, {
            highlightCode,
            selectable,
            streaming: context.streaming,
            capCodeBlocks: context.capCode,
            keyBase: `${key}-nested`,
            ...(context.stopped && !fenced.closed ? { stopped: true } : {}),
            ...(context.onFollowUp ? { onFollowUp: context.onFollowUp } : {}),
          })
        }
        {...(context.onFollowUp ? { onAsk: context.onFollowUp } : {})}
      />
    );
  }
  if (!fenced.closed && !context.streaming && fenceLanguage === '' && body.trim() === '') {
    return null;
  }
  const classified = classifySettledFence(
    fenceLanguage,
    body,
    fenced.closed,
    context.streaming,
    context.stopped,
  );
  if (classified === null && context.streaming) {
    return (
      <View
        key={key}
        testID="markdown-surface-pending"
        accessible
        accessibilityLabel="Block in progress"
        style={{ minHeight: chatTypography.body.lineHeight, marginVertical: 6 }}
      />
    );
  }
  if (classified === null) {
    return (
      <View key={key}>
        {renderCodeCard(
          `${key}-source`,
          body,
          fenceLanguage,
          highlightCode,
          context.streaming,
          fenced.closed,
          renderColors,
          selectable,
          context.capCode,
        )}
        <Text
          testID="markdown-surface-unfinished"
          style={{ fontSize: typeScale.caption, color: renderColors.textSecondary }}
        >
          This block was not finished.
        </Text>
      </View>
    );
  }
  if (canRenderAssistantSurface(classified)) {
    return (
      <AssistantSurface
        key={key}
        fence={classified}
        colors={renderColors}
        onFollowUp={context.onFollowUp}
        streaming={context.streaming}
        stopped={context.stopped && !fenced.closed}
        renderBody={(surfaceBody) =>
          renderMarkdownContent(surfaceBody, renderColors, {
            highlightCode,
            selectable,
            streaming: context.streaming,
            capCodeBlocks: context.capCode,
            keyBase: `${key}-nested`,
            ...(context.stopped && !fenced.closed ? { stopped: true } : {}),
            ...(context.onFollowUp ? { onFollowUp: context.onFollowUp } : {}),
          })
        }
      />
    );
  }
  const jsonChart =
    highlightCode && fenceLanguage.toLowerCase() === 'json'
      ? chartSpecFromFence(fenceLanguage, body)
      : null;
  const chart =
    fenceLanguage === 'mermaid' && (fenced.closed || !context.streaming)
      ? parseMermaidChart(body)
      : jsonChart
        ? chartSpecToChart(jsonChart)
        : null;
  if (chart) {
    return <ReportChart key={key} chart={chart} colors={renderColors} />;
  }
  const codeCard = renderCodeCard(
    key,
    body,
    fenceLanguage,
    highlightCode,
    context.streaming,
    fenced.closed,
    renderColors,
    selectable,
    context.capCode,
  );
  if (fenceLanguage === 'mermaid' && highlightCode) {
    return (
      <MermaidDiagramBlock
        key={`${key}-diagram`}
        source={body}
        colors={renderColors}
        sourceBlock={codeCard}
      />
    );
  }
  return codeCard;
}

export interface MarkdownRenderOptions {
  /**
   * A streaming message re-renders on every token, and highlighting re-tokenises
   * the whole fence each time; the plain fence settles into a highlighted one
   * once the turn ends.
   */
  highlightCode?: boolean;
  /** Defaults to the streaming row's unhighlighted state when not given. */
  streaming?: boolean;
  citations?: readonly CitationSource[];
  onHeadingLayout?: (sectionId: string, y: number) => void;
  onFollowUp?: (text: string) => void;
  selectable?: boolean;
  trustedImageUrls?: readonly string[];
  onTaskToggle?: (taskIndex: number) => void;
  stopped?: boolean;
  /** Chat answers cap a long code block and offer it full screen. */
  capCodeBlocks?: boolean;
  /** Keeps block keys apart when one answer renders markdown inside markdown. */
  keyBase?: string;
}

const NO_TRUSTED_IMAGES: ReadonlySet<string> = new Set();

function linkDefinitionLines(source: string): string[] {
  const lines = proseLines(source);
  let previousDefines = false;
  return lines.map((line, index) => {
    const previous = lines[index - 1] ?? '';
    const definition = readLinkDefinition(line) !== null;
    const interruptsParagraph =
      previous.trim() !== '' &&
      !previousDefines &&
      !HEADING_LINE.test(previous) &&
      !thematicBreakPattern.test(previous);
    previousDefines = definition && !interruptsParagraph;
    return previousDefines ? line : '';
  });
}

function trustedImagesFor(
  citations: readonly CitationSource[],
  urls: readonly string[] | undefined,
): ReadonlySet<string> {
  const candidates = [
    ...citations.flatMap((citation) => (citation.url ? [citation.url] : [])),
    ...(urls ?? []),
  ];
  return candidates.length > 0 ? trustedImageKeys(candidates) : NO_TRUSTED_IMAGES;
}

export function renderMarkdownContent(
  content: string,
  renderColors: ColorScheme = defaultColors,
  options: MarkdownRenderOptions = {},
): React.ReactNode[] {
  if (!content) return [];
  const highlightCode = options.highlightCode !== false;
  const streaming = options.streaming ?? !highlightCode;
  const citations = options.citations ?? [];
  const arrived = streaming ? holdStreamingCitationLink(content, citations) : content;
  const prepared = dropHiddenHtmlBlocks(
    prepareMarkdownSource(arrived, streaming, options.stopped === true),
    streaming,
  );
  const svgSlides = extractSvgSlides(
    liftAnswerBadges(streaming ? prepared : restoreHyphenatedLabels(prepared)),
  );
  const source = svgSlides.markdown;
  const footnotes = referencedFootnotes(source, collectFootnoteDefinitions(source));
  const trustedImages = trustedImagesFor(citations, options.trustedImageUrls);
  const context: SegmentContext = {
    citations,
    footnotes,
    gatherFootnotes: true,
    inlineOptions: {
      linkDefinitions: collectLinkDefinitions(linkDefinitionLines(source)),
      trustedImageKeys: trustedImages,
    },
    trustedImages,
    selectable: options.selectable !== false,
    highlightCode,
    streaming,
    stopped: options.stopped === true,
    capCode: options.capCodeBlocks === true,
    lineBase: 0,
    ...(options.onFollowUp ? { onFollowUp: options.onFollowUp } : {}),
    ...(options.onHeadingLayout
      ? { sectionId: createReportSectionIds(), onHeadingLayout: options.onHeadingLayout }
      : {}),
    ...(options.onTaskToggle && !streaming
      ? {
          taskToggle: {
            source,
            lineStarts: lineStartOffsets(source),
            onToggle: options.onTaskToggle,
          },
        }
      : {}),
  };
  const keyBase = options.keyBase ?? 'md';
  const nodes = renderTextSegment(source, keyBase, renderColors, context);
  const notes = Object.entries(footnotes).map(([label, text]) => ({ label, text }));
  if (notes.length > 0) {
    nodes.push(renderFootnoteSection(notes, `${keyBase}-footnotes`, renderColors, context));
  }
  return svgSlides.slides.length > 0
    ? [<SvgGallery key="svg-gallery" slides={svgSlides.slides} />, ...nodes]
    : nodes;
}
