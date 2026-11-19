import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, View, type ListRenderItemInfo } from 'react-native';
import { ArrowDown, ArrowUp, Copy, FileSpreadsheet, Share2 } from 'lucide-react-native';
import {
  SPREADSHEET_ROW_CAP,
  nextTabularSort,
  parseCsvTable,
  parseTabular,
  sortTabularRows,
  toCsv,
  toMarkdownTable,
  type TabularSort,
} from '@agiworkforce/unified-chat/tabular';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';

const CELL_WIDTH = 120;
const ROW_NUMBER_WIDTH = FULL_SCREEN_TOUCH_TARGET;
const ROW_HEIGHT = FULL_SCREEN_TOUCH_TARGET;
const SHEET_TAB_UNDERLINE = 2;

interface SelectedCell {
  row: number;
  column: number;
}

function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

export interface TabularSheet {
  name: string;
  content: string;
}

export interface TabularGridViewProps {
  title: string;
  content: string;
  /** Worksheets of a workbook as CSV, in tab order. When given they replace `content`. */
  sheets?: readonly TabularSheet[];
}

export function TabularGridView({ title, content, sheets }: TabularGridViewProps) {
  const colors = useThemeColors();
  const [sheetIndex, setSheetIndex] = useState(0);
  const activeIndex = sheets && sheets.length > 0 ? Math.min(sheetIndex, sheets.length - 1) : 0;
  const activeSheet = sheets?.[activeIndex] ?? null;
  const data = useMemo(
    () => (activeSheet ? parseCsvTable(activeSheet.content) : parseTabular(content)),
    [activeSheet, content],
  );
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [sort, setSort] = useState<TabularSort>(null);
  const cellCopy = useCopyAction();
  const tableCopy = useCopyAction();
  const sortedRows = useMemo(() => (data ? sortTabularRows(data, sort) : []), [data, sort]);
  const rows = useMemo(() => sortedRows.slice(0, SPREADSHEET_ROW_CAP), [sortedRows]);
  const truncated = sortedRows.length > SPREADSHEET_ROW_CAP;
  const columns = useMemo(() => data?.columns ?? [], [data]);
  const width = ROW_NUMBER_WIDTH + columns.length * CELL_WIDTH;
  const selectedValue = selected ? (rows[selected.row]?.[selected.column] ?? '') : null;

  const cycleSort = useCallback((column: number) => {
    setSelected(null);
    setSort((previous) => nextTabularSort(previous, column));
  }, []);

  const selectSheet = useCallback((index: number) => {
    setSheetIndex(index);
    setSort(null);
    setSelected(null);
  }, []);

  const shareName =
    activeSheet && sheets && sheets.length > 1
      ? `${title || 'table'} ${activeSheet.name}`
      : title || 'table';
  const handleShare = useCallback(() => {
    if (!data) return;
    void exportSourceFile(toCsv(data), shareName, 'csv')
      .then((result) => shareFile(result.uri))
      .catch((error: unknown) =>
        Alert.alert('Could not share table', toUserMessage(error, 'Try again in a moment.')),
      );
  }, [data, shareName]);

  const sheetTabs =
    sheets && sheets.length > 1 ? (
      <ScrollView
        horizontal
        testID="tabular-sheet-tabs"
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={`${countLabel(sheets.length, 'sheet')} in this workbook`}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: spacing.sm }}
      >
        {sheets.map((sheet, index) => {
          const isActive = index === activeIndex;
          return (
            <PressableBox
              key={`${sheet.name}-${index}`}
              testID={`tabular-sheet-tab-${index}`}
              onPress={() => {
                if (!isActive) selectSheet(index);
              }}
              accessibilityRole="tab"
              accessibilityLabel={sheet.name}
              accessibilityState={{ selected: isActive }}
              style={{
                minHeight: FULL_SCREEN_TOUCH_TARGET,
                minWidth: FULL_SCREEN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderBottomWidth: SHEET_TAB_UNDERLINE,
                borderBottomColor: isActive ? colors.textPrimary : colors.transparent,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? colors.textPrimary : colors.textMuted,
                }}
              >
                {sheet.name}
              </Text>
            </PressableBox>
          );
        })}
      </ScrollView>
    ) : null;

  const renderRow = useCallback(
    ({ item, index }: ListRenderItemInfo<string[]>) => (
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            width: ROW_NUMBER_WIDTH,
            minHeight: ROW_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{index + 1}</Text>
        </View>
        {columns.map((column, columnIndex) => {
          const value = item[columnIndex] ?? '';
          const isSelected = selected?.row === index && selected.column === columnIndex;
          const numeric = data?.numericColumns[columnIndex] ?? false;
          return (
            <PressableBox
              key={`${column}-${columnIndex}`}
              testID={`tabular-cell-${index}-${columnIndex}`}
              onPress={() => setSelected(isSelected ? null : { row: index, column: columnIndex })}
              onLongPress={() => {
                setSelected({ row: index, column: columnIndex });
                void cellCopy.copy(value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${column}: ${value || 'empty'}`}
              accessibilityHint="Selects the cell. Touch and hold to copy it."
              accessibilityState={{ selected: isSelected }}
              style={{
                width: CELL_WIDTH,
                minHeight: ROW_HEIGHT,
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
                borderLeftWidth: 1,
                borderLeftColor: colors.border,
                backgroundColor: isSelected ? colors.accentSurface : colors.transparent,
              }}
            >
              <Text
                numberOfLines={3}
                style={{
                  fontSize: typeScale.footnote,
                  color: colors.textPrimary,
                  textAlign: numeric ? 'right' : 'left',
                  fontVariant: numeric ? ['tabular-nums'] : undefined,
                }}
              >
                {value}
              </Text>
            </PressableBox>
          );
        })}
      </View>
    ),
    [cellCopy, colors, columns, data, selected],
  );

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        {sheetTabs}
        <View
          testID="tabular-grid-empty"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing['2xl'],
          }}
        >
          <FileSpreadsheet size={28} color={colors.textMuted} />
          <Text
            style={{ marginTop: spacing.md, fontSize: typeScale.body, color: colors.textMuted }}
          >
            {activeSheet ? 'This sheet is empty.' : 'Nothing to show yet.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View testID="tabular-grid" style={{ flex: 1 }}>
      {sheetTabs}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.lg,
          paddingRight: spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          testID="tabular-grid-summary"
          style={{ flex: 1, fontSize: typeScale.caption, color: colors.textMuted }}
        >
          {`${countLabel(sortedRows.length, 'row')} · ${countLabel(columns.length, 'column')}`}
        </Text>
        {selectedValue !== null ? (
          <PressableBox
            testID="tabular-copy-cell"
            onPress={() => void cellCopy.copy(selectedValue)}
            accessibilityRole="button"
            accessibilityLabel={copyControlLabel(cellCopy.status, 'Copy cell')}
            style={{
              minWidth: FULL_SCREEN_TOUCH_TARGET,
              minHeight: FULL_SCREEN_TOUCH_TARGET,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Copy size={16} color={colors.textSecondary} />
            <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
              {copyControlLabel(cellCopy.status, 'Copy cell')}
            </Text>
          </PressableBox>
        ) : null}
        <PressableBox
          testID="tabular-copy-markdown"
          onPress={() => void tableCopy.copy(toMarkdownTable(data))}
          accessibilityRole="button"
          accessibilityLabel={copyControlLabel(tableCopy.status, 'Copy as Markdown')}
          style={{
            minWidth: FULL_SCREEN_TOUCH_TARGET,
            minHeight: FULL_SCREEN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Copy size={18} color={colors.textSecondary} />
        </PressableBox>
        <PressableBox
          testID="tabular-share-csv"
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share as CSV"
          style={{
            minWidth: FULL_SCREEN_TOUCH_TARGET,
            minHeight: FULL_SCREEN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Share2 size={18} color={colors.textSecondary} />
        </PressableBox>
      </View>
      <ScrollView key={activeIndex} horizontal style={{ flex: 1 }} showsHorizontalScrollIndicator>
        <FlatList
          testID="tabular-grid-rows"
          style={{ width }}
          data={rows}
          keyExtractor={(_, index) => String(index)}
          renderItem={renderRow}
          initialNumToRender={30}
          windowSize={7}
          stickyHeaderIndices={[0]}
          ListHeaderComponent={
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.surfaceElevated,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ width: ROW_NUMBER_WIDTH, minHeight: ROW_HEIGHT }} />
              {columns.map((column, columnIndex) => {
                const direction = sort?.column === columnIndex ? sort.direction : null;
                const SortIcon = direction === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <PressableBox
                    key={`${column}-${columnIndex}`}
                    testID={`tabular-header-${columnIndex}`}
                    onPress={() => cycleSort(columnIndex)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      direction
                        ? `${column}, sorted ${direction === 'asc' ? 'ascending' : 'descending'}`
                        : column
                    }
                    accessibilityHint="Sorts the rows by this column"
                    style={{
                      width: CELL_WIDTH,
                      minHeight: ROW_HEIGHT,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderLeftWidth: 1,
                      borderLeftColor: colors.border,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      style={{
                        flex: 1,
                        fontSize: typeScale.footnote,
                        fontWeight: '600',
                        color: colors.textPrimary,
                        textAlign: data.numericColumns[columnIndex] ? 'right' : 'left',
                      }}
                    >
                      {column}
                    </Text>
                    {direction ? (
                      <SortIcon
                        testID={`tabular-sort-${direction}`}
                        size={12}
                        color={colors.textSecondary}
                      />
                    ) : null}
                  </PressableBox>
                );
              })}
            </View>
          }
          ListEmptyComponent={
            <View testID="tabular-grid-no-rows" style={{ padding: spacing['2xl'] }}>
              <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>No rows</Text>
            </View>
          }
        />
      </ScrollView>
      {truncated ? (
        <Text
          testID="tabular-grid-truncated"
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            fontSize: typeScale.caption,
            color: colors.textMuted,
          }}
        >
          {`Showing first ${SPREADSHEET_ROW_CAP} of ${sortedRows.length.toLocaleString()} rows. Share as CSV for the full data.`}
        </Text>
      ) : null}
    </View>
  );
}
