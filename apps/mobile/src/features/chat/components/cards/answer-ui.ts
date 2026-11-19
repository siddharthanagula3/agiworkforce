import {
  formatAnswerUiNumber,
  type AnswerUiValue,
  type AnswerUiValues,
  type ChartRenderSpec,
  type ChartRow,
} from '@agiworkforce/types';
import {
  AnswerUiMessageResponseSchema,
  INTERACTIVE_CARD_RESPONSE_PATH,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import type { MermaidChart } from '@/src/features/chat/utils/mermaidChart';

export const ANSWER_UI_SEND_WAITS_FOR_REPLY = 'Available when the reply finishes.';
export const ANSWER_UI_SEND_NEEDS_SAVED_CHAT = 'Buttons that send a message work in saved chats.';
export const ANSWER_UI_SEND_FAILED_MESSAGE =
  "Couldn't send that from the card. Type it in the message box instead.";

export interface AnswerUiChartTable {
  header: string;
  series: string[];
  rows: Array<{ label: string; cells: string[] }>;
}

function chartLabel(value: ChartRow[string] | undefined): string {
  return typeof value === 'number' ? formatAnswerUiNumber(value) : (value ?? '');
}

function chartCategory(value: ChartRow[string] | undefined): string {
  return value === undefined ? '' : String(value);
}

function chartNumber(value: ChartRow[string] | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function answerUiChartTable(spec: ChartRenderSpec): AnswerUiChartTable {
  return {
    header: spec.xLabel ?? (spec.kind === 'scatter' ? 'x' : 'Label'),
    series: spec.series.map((series) => series.name ?? series.dataKey),
    rows: spec.rows.map((row) => ({
      label: chartLabel(row[spec.xKey]),
      cells: spec.series.map((series) => {
        const value = chartNumber(row[series.dataKey]);
        return value === null ? '' : formatAnswerUiNumber(value);
      }),
    })),
  };
}

export function answerUiMermaidChart(spec: ChartRenderSpec): MermaidChart | null {
  if (spec.kind === 'scatter') return null;
  if (spec.kind === 'pie') {
    const series = spec.series[0];
    if (!series) return null;
    const slices = spec.rows.flatMap((row) => {
      const value = chartNumber(row[series.dataKey]);
      return value !== null && value > 0 ? [{ label: chartCategory(row[spec.xKey]), value }] : [];
    });
    return slices.length > 0
      ? {
          kind: 'pie',
          ...(spec.title ? { title: spec.title } : {}),
          slices,
          ...(spec.xLabel ? { categoryHeader: spec.xLabel } : {}),
          showLegend: true,
          totalRows: slices.length,
        }
      : null;
  }
  if (spec.rows.length === 0) return null;
  const type = spec.kind === 'bar' ? 'bar' : 'line';
  return {
    kind: 'xy',
    ...(spec.title ? { title: spec.title } : {}),
    categories: spec.rows.map((row) => chartCategory(row[spec.xKey])),
    ...(spec.xLabel ? { xLabel: spec.xLabel, categoryHeader: spec.xLabel } : {}),
    ...(spec.yLabel ? { yLabel: spec.yLabel } : {}),
    series: spec.series.map((series) => ({
      type,
      name: series.name ?? series.dataKey,
      values: spec.rows.map((row) => chartNumber(row[series.dataKey])),
    })),
    showLegend: spec.series.length > 1,
    totalRows: spec.rows.length,
  };
}

export interface AnswerUiScatterPoint {
  x: number;
  y: number;
}

export interface AnswerUiScatterSeries {
  name: string;
  points: AnswerUiScatterPoint[];
}

export function answerUiScatterSeries(spec: ChartRenderSpec): AnswerUiScatterSeries[] {
  return spec.series.map((series) => ({
    name: series.name ?? series.dataKey,
    points: spec.rows.flatMap((row) => {
      const x = chartNumber(row[spec.xKey]);
      const y = chartNumber(row[series.dataKey]);
      return x === null || y === null ? [] : [{ x, y }];
    }),
  }));
}

export interface AnswerUiScatterAxis {
  low: number;
  high: number;
  ticks: number[];
}

function niceStep(span: number, tickCount: number): number {
  const raw = span / Math.max(1, tickCount);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice =
    fraction >= Math.sqrt(50) ? 10 : fraction >= Math.sqrt(10) ? 5 : fraction >= Math.SQRT2 ? 2 : 1;
  return nice * magnitude;
}

export function answerUiScatterAxis(
  numbers: readonly number[],
  tickCount: number,
): AnswerUiScatterAxis {
  const min = Math.min(0, ...numbers);
  const max = Math.max(0, ...numbers);
  const span = max > min ? max - min : 1;
  const step = niceStep(span, tickCount);
  const low = Math.floor(min / step) * step;
  const high = Math.max(low + step, Math.ceil(max / step) * step);
  const count = Math.round((high - low) / step);
  return {
    low,
    high,
    ticks: Array.from({ length: count + 1 }, (_, index) =>
      Number((low + step * index).toPrecision(12)),
    ),
  };
}

export function describeAnswerUiScatter(
  title: string,
  series: readonly AnswerUiScatterSeries[],
): string {
  const plotted = series.filter((entry) => entry.points.length > 0);
  if (plotted.length === 0) return `Scatter chart, ${title}: nothing to plot`;
  const parts = plotted.map(
    (entry) =>
      `${entry.name}: ${entry.points
        .map((point) => `${formatAnswerUiNumber(point.x)}, ${formatAnswerUiNumber(point.y)}`)
        .join('; ')}`,
  );
  return `Scatter chart, ${title}. ${parts.join('. ')}`;
}

const FILE_KINDS: ReadonlyArray<[RegExp, AnswerUiFileKind]> = [
  [/^(png|jpe?g|gif|webp|svg|heic|image)$/, 'image'],
  [/^(json)$/, 'json'],
  [/^(csv|xlsx?|tsv|sheet)$/, 'sheet'],
  [/^(zip|tar|gz|7z|rar)$/, 'archive'],
  [/^(js|ts|tsx|jsx|py|rs|go|java|rb|sh|html|css|sql|yaml|yml|toml|code)$/, 'code'],
  [/^(pdf|docx?|txt|md|rtf|pptx?|doc|text)$/, 'text'],
];

export type AnswerUiFileKind = 'image' | 'json' | 'sheet' | 'archive' | 'code' | 'text' | 'file';

export function answerUiFileKind(fileType: string): AnswerUiFileKind {
  const type = fileType.toLowerCase();
  return FILE_KINDS.find(([pattern]) => pattern.test(type))?.[1] ?? 'file';
}

export interface AnswerUiSendTarget {
  conversationId: string;
  messageId: string;
  cardId: string;
}

export async function requestAnswerUiMessage(
  target: AnswerUiSendTarget,
  actionId: string,
  values: Record<string, AnswerUiValue>,
): Promise<string> {
  const accountEpoch = captureCloudAccountEpoch();
  const response = await api.post<unknown>(
    INTERACTIVE_CARD_RESPONSE_PATH,
    {
      conversation_id: target.conversationId,
      message_id: target.messageId,
      card_id: target.cardId,
      response: { kind: 'message', action_id: actionId, values },
    },
    { accountEpoch },
  );
  const parsed = AnswerUiMessageResponseSchema.safeParse(response);
  if (!parsed.success || !isCloudAccountEpochCurrent(accountEpoch)) {
    throw new Error(ANSWER_UI_SEND_FAILED_MESSAGE);
  }
  return parsed.data.message;
}

function sameAnswerUiValue(a: AnswerUiValue | undefined, b: AnswerUiValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedB = [...b].sort();
    return [...a].sort().every((entry, index) => entry === sortedB[index]);
  }
  return a === b;
}

export function answerUiValuesChanged(initial: AnswerUiValues, current: AnswerUiValues): boolean {
  const ids = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const id of ids) {
    if (!sameAnswerUiValue(initial[id], current[id])) return true;
  }
  return false;
}
