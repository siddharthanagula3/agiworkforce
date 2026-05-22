/**
 * DynamicCanvas — Generative UI / Dynamic Workspace
 *
 * Renders AI-generated canvas elements (text, markdown, code, images, data tables,
 * kanban boards, charts, forms, and timers) as interactive, resizable widgets.
 * Connected to the Rust backend's Canvas/A2UI system.
 *
 * This is the "Carson-style" generative workspace where the AI can create
 * dynamic UI artifacts during conversations.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Code2,
  FileText,
  Image,
  Table2,
  Type,
  Download,
  Copy,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Layout,
  Columns3,
  BarChart3,
  FormInput,
  Timer,
  GripVertical,
  Play,
  Pause,
  RotateCcw,
  Send,
  ChevronDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke, listen, isTauri } from '../../lib/tauri-mock';

// ─── Types matching Rust backend ───

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface Bounds {
  position: Position;
  size: Size;
}

interface ElementStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
}

// ─── Kanban Types ───

interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  color?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

// ─── Chart Types ───

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// ─── Form Types ───

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string | number | boolean;
}

// ─── Canvas Element Union ───

type CanvasElement =
  | { type: 'Text'; id: string; bounds: Bounds; content: string; style: ElementStyle }
  | { type: 'Markdown'; id: string; bounds: Bounds; content: string; style: ElementStyle }
  | {
      type: 'Code';
      id: string;
      bounds: Bounds;
      content: string;
      language?: string;
      style: ElementStyle;
    }
  | { type: 'Image'; id: string; bounds: Bounds; url: string; alt?: string; style: ElementStyle }
  | { type: 'Shape'; id: string; bounds: Bounds; shape: string; style: ElementStyle }
  | {
      type: 'DataTable';
      id: string;
      bounds: Bounds;
      headers: string[];
      rows: string[][];
      style: ElementStyle;
    }
  | {
      type: 'KanbanBoard';
      id: string;
      bounds: Bounds;
      title: string;
      columns: KanbanColumn[];
      style: ElementStyle;
    }
  | {
      type: 'Chart';
      id: string;
      bounds: Bounds;
      chartType: 'bar' | 'line';
      title: string;
      data: ChartDataPoint[];
      style: ElementStyle;
    }
  | {
      type: 'Form';
      id: string;
      bounds: Bounds;
      title: string;
      fields: FormField[];
      submitLabel?: string;
      style: ElementStyle;
    }
  | {
      type: 'Timer';
      id: string;
      bounds: Bounds;
      label: string;
      mode: 'countdown' | 'stopwatch';
      durationSeconds?: number;
      style: ElementStyle;
    };

interface Canvas {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
}

// ─── Props ───

interface DynamicCanvasProps {
  canvasId?: string;
  className?: string;
  onElementClick?: (element: CanvasElement) => void;
  onFormSubmit?: (elementId: string, data: Record<string, string | number | boolean>) => void;
  readOnly?: boolean;
}

// ─── Widget Palette Config ───

interface PaletteItem {
  type: CanvasElement['type'];
  label: string;
  description: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'Text', label: 'Text', description: 'Plain text block' },
  { type: 'Markdown', label: 'Markdown', description: 'Rich markdown content' },
  { type: 'Code', label: 'Code', description: 'Code snippet with syntax' },
  { type: 'Image', label: 'Image', description: 'Image from URL' },
  { type: 'DataTable', label: 'Data Table', description: 'Tabular data display' },
  { type: 'KanbanBoard', label: 'Kanban Board', description: 'Task columns with cards' },
  { type: 'Chart', label: 'Chart', description: 'Bar or line chart (SVG)' },
  { type: 'Form', label: 'Form', description: 'Interactive input form' },
  { type: 'Timer', label: 'Timer', description: 'Countdown or stopwatch' },
  { type: 'Shape', label: 'Shape', description: 'Basic shape placeholder' },
];

// ─── Chart Colors ───

const CHART_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

// ─── Helpers ───

function getElementId(el: CanvasElement): string {
  return el.id;
}

function getElementBounds(el: CanvasElement): Bounds {
  return el.bounds;
}

function getElementType(el: CanvasElement): string {
  return el.type;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'Text':
      return <Type className="h-3 w-3" />;
    case 'Markdown':
      return <FileText className="h-3 w-3" />;
    case 'Code':
      return <Code2 className="h-3 w-3" />;
    case 'Image':
      return <Image className="h-3 w-3" />;
    case 'DataTable':
      return <Table2 className="h-3 w-3" />;
    case 'KanbanBoard':
      return <Columns3 className="h-3 w-3" />;
    case 'Chart':
      return <BarChart3 className="h-3 w-3" />;
    case 'Form':
      return <FormInput className="h-3 w-3" />;
    case 'Timer':
      return <Timer className="h-3 w-3" />;
    default:
      return <Layout className="h-3 w-3" />;
  }
}

function formatTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── SVG Chart Renderer ───

function SvgBarChart({
  data,
  width,
  height,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
}) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const padding = { top: 16, right: 12, bottom: 32, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barW = Math.max(12, (chartW / data.length) * 0.7);
  const gap = (chartW - barW * data.length) / (data.length + 1);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Y-axis */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      {/* X-axis */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      {/* Bars */}
      {data.map((pt, i) => {
        const barH = maxVal > 0 ? (pt.value / maxVal) * chartH : 0;
        const x = padding.left + gap + i * (barW + gap);
        const y = height - padding.bottom - barH;
        const color = pt.color ?? CHART_COLORS[i % CHART_COLORS.length] ?? '#3B82F6';
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              className="text-[9px] fill-zinc-500"
            >
              {pt.value}
            </text>
            <text
              x={x + barW / 2}
              y={height - padding.bottom + 12}
              textAnchor="middle"
              className="text-[9px] fill-zinc-500"
            >
              {pt.label.length > 8 ? `${pt.label.slice(0, 8)}..` : pt.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SvgLineChart({
  data,
  width,
  height,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
}) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;
  const padding = { top: 16, right: 12, bottom: 32, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const color = data[0]?.color ?? CHART_COLORS[0] ?? '#3B82F6';

  const points = data.map((pt, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartW,
    y: height - padding.bottom - ((pt.value - minVal) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Axes */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Points + labels */}
      {points.map((p, i) => {
        const pt = data[i];
        if (!pt) return null;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} />
            <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[9px] fill-zinc-500">
              {pt.value}
            </text>
            <text
              x={p.x}
              y={height - padding.bottom + 12}
              textAnchor="middle"
              className="text-[9px] fill-zinc-500"
            >
              {pt.label.length > 6 ? `${pt.label.slice(0, 6)}..` : pt.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Kanban Board Renderer ───

function KanbanBoardContent({
  columns,
  onMoveCard,
  readOnly,
}: {
  columns: KanbanColumn[];
  onMoveCard?: (cardId: string, fromCol: string, toCol: string) => void;
  readOnly: boolean;
}) {
  const [draggedCard, setDraggedCard] = useState<{ cardId: string; fromCol: string } | null>(null);

  const handleDragStart = (cardId: string, colId: string) => {
    if (readOnly) return;
    setDraggedCard({ cardId, fromCol: colId });
  };

  const handleDrop = (toColId: string) => {
    if (!draggedCard || draggedCard.fromCol === toColId) {
      setDraggedCard(null);
      return;
    }
    onMoveCard?.(draggedCard.cardId, draggedCard.fromCol, toColId);
    setDraggedCard(null);
  };

  return (
    <div className="flex gap-2 h-full overflow-x-auto">
      {columns.map((col) => (
        <div
          key={col.id}
          className="flex-shrink-0 w-40 flex flex-col rounded bg-muted/40 border border-border/20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(col.id)}
        >
          <div className="px-2 py-1.5 text-xs font-semibold border-b border-border/20 flex items-center justify-between">
            <span>{col.title}</span>
            <span className="text-muted-foreground text-[10px]">{col.cards.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-1 space-y-1">
            {col.cards.map((card) => (
              <div
                key={card.id}
                draggable={!readOnly}
                onDragStart={() => handleDragStart(card.id, col.id)}
                className="rounded border border-border/30 bg-background p-1.5 text-xs cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                style={{
                  borderLeftColor: card.color ?? undefined,
                  borderLeftWidth: card.color ? 3 : undefined,
                }}
              >
                <div className="flex items-start gap-1">
                  <GripVertical className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{card.title}</p>
                    {card.description && (
                      <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-2">
                        {card.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Form Widget Renderer ───

function FormContent({
  fields,
  title,
  submitLabel,
  onSubmit,
  readOnly,
}: {
  fields: FormField[];
  title: string;
  submitLabel?: string;
  onSubmit?: (data: Record<string, string | number | boolean>) => void;
  readOnly: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      if (field.defaultValue !== undefined) {
        init[field.name] = field.defaultValue;
      } else if (field.type === 'checkbox') {
        init[field.name] = false;
      } else if (field.type === 'number') {
        init[field.name] = 0;
      } else {
        init[field.name] = '';
      }
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (name: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    setSubmitted(true);
    onSubmit?.(formData);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-muted-foreground">
        <FormInput className="h-5 w-5 text-emerald-500" />
        <span className="font-medium text-foreground">Submitted</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {title && <p className="text-xs font-semibold">{title}</p>}
      {fields.map((field) => (
        <div key={field.name} className="space-y-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          {field.type === 'text' && (
            <input
              type="text"
              value={String(formData[field.name] ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              disabled={readOnly}
              className="w-full rounded border border-border/50 bg-muted/30 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          )}
          {field.type === 'number' && (
            <input
              type="number"
              value={Number(formData[field.name] ?? 0)}
              onChange={(e) => handleChange(field.name, e.target.valueAsNumber || 0)}
              placeholder={field.placeholder}
              required={field.required}
              disabled={readOnly}
              className="w-full rounded border border-border/50 bg-muted/30 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          )}
          {field.type === 'select' && (
            <select
              value={String(formData[field.name] ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              disabled={readOnly}
              className="w-full rounded border border-border/50 bg-muted/30 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">{field.placeholder ?? 'Select...'}</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {field.type === 'checkbox' && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(formData[field.name])}
                onChange={(e) => handleChange(field.name, e.target.checked)}
                disabled={readOnly}
                className="rounded border-border/50"
              />
              <span className="text-xs text-muted-foreground">{field.placeholder ?? ''}</span>
            </label>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Send className="h-3 w-3" />
          {submitLabel ?? 'Submit'}
        </button>
      )}
    </form>
  );
}

// ─── Timer Widget Renderer ───

function TimerContent({
  mode,
  label,
  durationSeconds,
  readOnly,
}: {
  mode: 'countdown' | 'stopwatch';
  label: string;
  durationSeconds?: number;
  readOnly: boolean;
}) {
  const initialTime = mode === 'countdown' ? (durationSeconds ?? 60) : 0;
  const [seconds, setSeconds] = useState(initialTime);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (mode === 'countdown') {
          if (prev <= 0) {
            setRunning(false);
            return 0;
          }
          return prev - 1;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, mode]);

  const handleReset = () => {
    setRunning(false);
    setSeconds(initialTime);
  };

  const progress =
    mode === 'countdown' && (durationSeconds ?? 60) > 0 ? seconds / (durationSeconds ?? 60) : 0;

  const isFinished = mode === 'countdown' && seconds === 0 && !running && initialTime > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-2">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>

      {/* Circular progress for countdown */}
      {mode === 'countdown' ? (
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={4}
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={isFinished ? '#EF4444' : '#3B82F6'}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-mono font-bold ${isFinished ? 'text-destructive' : ''}`}>
              {formatTime(seconds)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <span className="text-2xl font-mono font-bold tabular-nums">{formatTime(seconds)}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRunning(!running)}
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Widget Palette ───

function WidgetPalette({
  open,
  onToggle,
  onAddWidget,
}: {
  open: boolean;
  onToggle: () => void;
  onAddWidget: (type: CanvasElement['type']) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 p-1 text-muted-foreground hover:text-foreground"
        title="Add widget"
      >
        <Plus className="h-3.5 w-3.5" />
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-md border border-border/50 bg-background shadow-lg py-1">
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Add Widget
          </div>
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.type}
              onClick={() => {
                onAddWidget(item.type);
                onToggle();
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <span className="flex-shrink-0 text-muted-foreground">{getTypeIcon(item.type)}</span>
              <div className="min-w-0 text-left">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground ml-1.5">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Default Element Factories ───

function createDefaultElement(
  type: CanvasElement['type'],
  nextX: number,
  nextY: number,
): CanvasElement {
  const base = { id: generateId(), style: {} };
  const defaultBounds = (w: number, h: number): Bounds => ({
    position: { x: nextX, y: nextY },
    size: { width: w, height: h },
  });

  switch (type) {
    case 'Text':
      return { ...base, type: 'Text', bounds: defaultBounds(240, 100), content: 'New text block' };
    case 'Markdown':
      return {
        ...base,
        type: 'Markdown',
        bounds: defaultBounds(300, 160),
        content: '## New Markdown\n\nEdit this content.',
      };
    case 'Code':
      return {
        ...base,
        type: 'Code',
        bounds: defaultBounds(300, 140),
        content: '// your code here\n',
        language: 'typescript',
      };
    case 'Image':
      return {
        ...base,
        type: 'Image',
        bounds: defaultBounds(240, 180),
        url: '',
        alt: 'placeholder',
      };
    case 'Shape':
      return { ...base, type: 'Shape', bounds: defaultBounds(120, 120), shape: 'rectangle' };
    case 'DataTable':
      return {
        ...base,
        type: 'DataTable',
        bounds: defaultBounds(360, 180),
        headers: ['Column A', 'Column B'],
        rows: [
          ['Row 1', 'Value'],
          ['Row 2', 'Value'],
        ],
      };
    case 'KanbanBoard':
      return {
        ...base,
        type: 'KanbanBoard',
        bounds: defaultBounds(520, 280),
        title: 'Task Board',
        columns: [
          { id: 'todo', title: 'To Do', cards: [{ id: 'c1', title: 'Sample task' }] },
          { id: 'progress', title: 'In Progress', cards: [] },
          { id: 'done', title: 'Done', cards: [] },
        ],
      };
    case 'Chart':
      return {
        ...base,
        type: 'Chart',
        bounds: defaultBounds(380, 240),
        chartType: 'bar',
        title: 'Sample Chart',
        data: [
          { label: 'A', value: 30 },
          { label: 'B', value: 55 },
          { label: 'C', value: 42 },
          { label: 'D', value: 18 },
        ],
      };
    case 'Form':
      return {
        ...base,
        type: 'Form',
        bounds: defaultBounds(280, 240),
        title: 'Input Form',
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Enter name' },
          {
            name: 'priority',
            label: 'Priority',
            type: 'select',
            options: ['Low', 'Medium', 'High'],
          },
        ],
        submitLabel: 'Submit',
      };
    case 'Timer':
      return {
        ...base,
        type: 'Timer',
        bounds: defaultBounds(200, 200),
        label: 'Task Timer',
        mode: 'countdown',
        durationSeconds: 300,
      };
  }
}

// ─── Component ───

export function DynamicCanvas({
  canvasId,
  className,
  onElementClick,
  onFormSubmit,
  readOnly = false,
}: DynamicCanvasProps) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load canvas
  const loadCanvas = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Canvas | null>('canvas_get', { id });
      if (result) {
        setCanvas(result);
      } else {
        setError('Canvas not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for canvas updates
  useEffect(() => {
    if (!canvasId) {
      setLoading(false);
      return;
    }

    loadCanvas(canvasId);

    if (!isTauri) return;

    let mounted = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      try {
        const unlisten = await listen<{ canvasId: string }>('canvas:updated', (event) => {
          if (mounted && event.payload.canvasId === canvasId) {
            loadCanvas(canvasId);
          }
        });
        if (mounted) unlisteners.push(unlisten);
        else unlisten();
      } catch (e) {
        console.warn('[DynamicCanvas] Failed to setup listener:', e);
      }
    };

    setup();

    return () => {
      mounted = false;
      unlisteners.forEach((u) => u());
    };
  }, [canvasId, loadCanvas]);

  // Create new canvas
  const createCanvas = useCallback(async () => {
    setLoading(true);
    try {
      const id = await invoke<string>('canvas_create', {
        name: 'Workspace',
        width: 1200,
        height: 800,
      });
      loadCanvas(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [loadCanvas]);

  // Delete element
  const deleteElement = useCallback(
    async (elementId: string) => {
      if (!canvas) return;
      try {
        await invoke('canvas_remove_element', {
          canvasId: canvas.id,
          elementId,
        });
        setCanvas((prev) =>
          prev
            ? {
                ...prev,
                elements: prev.elements.filter((e) => getElementId(e) !== elementId),
              }
            : null,
        );
        if (selectedElement === elementId) setSelectedElement(null);
      } catch (err) {
        console.error('Failed to delete element:', err);
      }
    },
    [canvas, selectedElement],
  );

  // Copy content
  const copyContent = useCallback(async (el: CanvasElement) => {
    let text = '';
    if ('content' in el) {
      text = el.content;
    } else if (el.type === 'DataTable') {
      text = [el.headers.join('\t'), ...el.rows.map((r) => r.join('\t'))].join('\n');
    } else if (el.type === 'KanbanBoard') {
      text = el.columns
        .map(
          (col) =>
            `## ${col.title}\n${col.cards.map((c) => `- ${c.title}${c.description ? `: ${c.description}` : ''}`).join('\n')}`,
        )
        .join('\n\n');
    } else if (el.type === 'Chart') {
      text = `${el.title}\n${el.data.map((d) => `${d.label}: ${d.value}`).join('\n')}`;
    } else if (el.type === 'Form') {
      text = `${el.title}\nFields: ${el.fields.map((f) => f.label).join(', ')}`;
    } else if (el.type === 'Timer') {
      text = `${el.label} (${el.mode}${el.durationSeconds ? ` ${el.durationSeconds}s` : ''})`;
    }
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, []);

  // Add widget from palette
  const addWidget = useCallback(
    async (type: CanvasElement['type']) => {
      if (!canvas) return;
      const offsetX = 20 + (canvas.elements.length % 5) * 30;
      const offsetY = 40 + (canvas.elements.length % 5) * 30;
      const element = createDefaultElement(type, offsetX, offsetY);

      setCanvas((prev) => (prev ? { ...prev, elements: [...prev.elements, element] } : null));

      try {
        await invoke('canvas_add_element', {
          canvasId: canvas.id,
          element,
        });
      } catch (err) {
        console.error('Failed to persist new element:', err);
      }
    },
    [canvas],
  );

  // Kanban card move handler
  const handleKanbanMove = useCallback(
    (elementId: string, cardId: string, fromCol: string, toCol: string) => {
      setCanvas((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          elements: prev.elements.map((el) => {
            if (getElementId(el) !== elementId || el.type !== 'KanbanBoard') return el;
            let movedCard: KanbanCard | undefined;
            const newCols = el.columns.map((col) => {
              if (col.id === fromCol) {
                const card = col.cards.find((c) => c.id === cardId);
                if (card) movedCard = card;
                return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
              }
              return col;
            });
            if (!movedCard) return el;
            const finalCard = movedCard;
            return {
              ...el,
              columns: newCols.map((col) =>
                col.id === toCol ? { ...col, cards: [...col.cards, finalCard] } : col,
              ),
            };
          }),
        };
      });
    },
    [],
  );

  // Drag handling
  const handleMouseDown = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (readOnly) return;
      const el = canvas?.elements.find((el) => getElementId(el) === id);
      if (!el) return;
      const bounds = getElementBounds(el);
      setDragging({
        id,
        startX: e.clientX,
        startY: e.clientY,
        origX: bounds.position.x,
        origY: bounds.position.y,
      });
      setSelectedElement(id);
      e.stopPropagation();
    },
    [canvas, readOnly],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      setCanvas((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          elements: prev.elements.map((el) => {
            if (getElementId(el) === dragging.id) {
              return {
                ...el,
                bounds: {
                  ...el.bounds,
                  position: {
                    x: dragging.origX + dx,
                    y: dragging.origY + dy,
                  },
                },
              };
            }
            return el;
          }),
        };
      });
    };

    const handleMouseUp = async () => {
      if (canvas && dragging) {
        const el = canvas.elements.find((el) => getElementId(el) === dragging.id);
        if (el) {
          const bounds = getElementBounds(el);
          try {
            await invoke('canvas_update_element', {
              canvasId: canvas.id,
              elementId: dragging.id,
              updates: { x: bounds.position.x, y: bounds.position.y },
            });
          } catch (err) {
            console.error('Failed to update element position:', err);
          }
        }
      }
      setDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, canvas]);

  // Export canvas
  const handleExport = useCallback(async () => {
    if (!canvas) return;
    try {
      const json = await invoke<string>('canvas_export', { canvasId: canvas.id });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-${canvas.name}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Failed to export canvas:', err);
    }
  }, [canvas]);

  // ─── Render ───

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className ?? ''}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className ?? ''}`}>
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={createCanvas}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create Canvas
        </button>
      </div>
    );
  }

  if (!canvas) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className ?? ''}`}>
        <Layout className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No canvas active</p>
        <button
          onClick={createCanvas}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create Workspace
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-auto bg-background border border-border/50 rounded-lg ${className ?? ''}`}
      ref={containerRef}
      onClick={() => {
        setSelectedElement(null);
        setPaletteOpen(false);
      }}
    >
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/30 bg-background/95 backdrop-blur-sm px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layout className="h-3.5 w-3.5" />
          <span className="font-medium">{canvas.name}</span>
          <span>· {canvas.elements.length} elements</span>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <div onClick={(e) => e.stopPropagation()}>
              <WidgetPalette
                open={paletteOpen}
                onToggle={() => setPaletteOpen((p) => !p)}
                onAddWidget={addWidget}
              />
            </div>
          )}
          <button
            onClick={() => loadCanvas(canvas.id)}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleExport}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Export"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        className="relative"
        style={{ width: canvas.width, height: canvas.height, minHeight: 400 }}
      >
        {canvas.elements.map((element) => {
          const id = getElementId(element);
          const bounds = getElementBounds(element);
          const type = getElementType(element);
          const isSelected = selectedElement === id;

          return (
            <div
              key={id}
              className={`absolute rounded-md border shadow-sm transition-shadow ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/30 shadow-md'
                  : 'border-border/40 hover:border-border/70 hover:shadow-md'
              } ${dragging?.id === id ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                left: bounds.position.x,
                top: bounds.position.y,
                width: bounds.size.width,
                height: bounds.size.height,
                backgroundColor: element.style?.backgroundColor ?? 'var(--background)',
                borderColor: isSelected ? undefined : element.style?.borderColor,
                borderRadius: element.style?.borderRadius ?? 6,
                opacity: element.style?.opacity ?? 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedElement(id);
                onElementClick?.(element);
              }}
            >
              {/* Element header */}
              <div
                className="flex items-center justify-between px-2 py-1 border-b border-border/20 bg-muted/30 rounded-t-md"
                onMouseDown={(e) => handleMouseDown(id, e)}
              >
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {getTypeIcon(type)}
                  <span>{type}</span>
                </div>
                {isSelected && !readOnly && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyContent(element);
                      }}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      title="Copy"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement(id);
                      }}
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Element content */}
              <div
                className="overflow-auto p-2"
                style={{
                  maxHeight: bounds.size.height - 28,
                  fontSize: element.style?.fontSize ?? 14,
                }}
              >
                {element.type === 'Text' && (
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: element.style?.color }}
                  >
                    {element.content}
                  </p>
                )}

                {element.type === 'Markdown' && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{element.content}</ReactMarkdown>
                  </div>
                )}

                {element.type === 'Code' && (
                  <pre className="rounded bg-muted/50 p-2 text-xs font-mono overflow-x-auto">
                    <code>{element.content}</code>
                  </pre>
                )}

                {type === 'Image' && (
                  <img
                    src={element.type === 'Image' ? element.url : ''}
                    alt={element.type === 'Image' ? (element.alt ?? '') : ''}
                    className="max-w-full h-auto rounded"
                  />
                )}

                {type === 'DataTable' && element.type === 'DataTable' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          {element.headers.map((h, i) => (
                            <th
                              key={i}
                              className="border border-border/30 bg-muted/30 px-2 py-1 text-left font-medium"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {element.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="border border-border/30 px-2 py-1">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {type === 'Shape' && (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <span className="text-xs">
                      {element.type === 'Shape' ? element.shape : 'shape'}
                    </span>
                  </div>
                )}

                {element.type === 'KanbanBoard' && (
                  <KanbanBoardContent
                    columns={element.columns}
                    readOnly={readOnly}
                    onMoveCard={(cardId, fromCol, toCol) =>
                      handleKanbanMove(id, cardId, fromCol, toCol)
                    }
                  />
                )}

                {element.type === 'Chart' && (
                  <div className="space-y-1">
                    {element.title && (
                      <p className="text-xs font-medium text-center">{element.title}</p>
                    )}
                    {element.chartType === 'bar' && (
                      <SvgBarChart
                        data={element.data}
                        width={bounds.size.width - 16}
                        height={Math.max(bounds.size.height - 60, 120)}
                      />
                    )}
                    {element.chartType === 'line' && (
                      <SvgLineChart
                        data={element.data}
                        width={bounds.size.width - 16}
                        height={Math.max(bounds.size.height - 60, 120)}
                      />
                    )}
                  </div>
                )}

                {element.type === 'Form' && (
                  <FormContent
                    fields={element.fields}
                    title={element.title}
                    submitLabel={element.submitLabel}
                    readOnly={readOnly}
                    onSubmit={(data) => onFormSubmit?.(id, data)}
                  />
                )}

                {element.type === 'Timer' && (
                  <TimerContent
                    mode={element.mode}
                    label={element.label}
                    durationSeconds={element.durationSeconds}
                    readOnly={readOnly}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {canvas.elements.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Layout className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Empty workspace</p>
            <p className="text-xs">
              {readOnly
                ? 'The AI will generate widgets here during conversations'
                : 'Click the + button to add widgets, or the AI will generate them'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
