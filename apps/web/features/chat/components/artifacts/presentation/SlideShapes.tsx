'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SHAPE_LABELS, type DeckShape } from './deck-shapes';
import type { DeckTheme } from './deck-themes';
import styles from './Deck.module.css';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;
const STROKE = 6;
const LABEL_SIZE = 38;
const NUDGE = 1;

function px(value: number, axis: 'x' | 'y'): number {
  return (value / 100) * (axis === 'x' ? VIEW_WIDTH : VIEW_HEIGHT);
}

function ShapeGeometry({ shape, theme }: { shape: DeckShape; theme: DeckTheme }) {
  const x = px(shape.x, 'x');
  const y = px(shape.y, 'y');
  const w = px(shape.w, 'x');
  const h = px(shape.h, 'y');
  const fill = theme.surface;
  const stroke = theme.accent;
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return (
        <line
          x1={x}
          y1={y}
          x2={x + w}
          y2={y + h}
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          {...(shape.kind === 'arrow' ? { markerEnd: 'url(#deck-arrowhead)' } : {})}
        />
      );
    case 'oval':
      return (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={STROKE}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={STROKE}
        />
      );
    default:
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={shape.kind === 'rounded' ? Math.min(w, h) * 0.18 : 0}
          fill={fill}
          stroke={stroke}
          strokeWidth={STROKE}
        />
      );
  }
}

export function SlideShapes({
  shapes,
  theme,
  editable = false,
  selectedId = null,
  onSelect,
  onChange,
}: {
  shapes: readonly DeckShape[];
  theme: DeckTheme;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (shapes: DeckShape[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
  } | null>(null);

  const moveBy = (id: string, dx: number, dy: number) => {
    onChange?.(
      shapes.map((shape) =>
        shape.id === id
          ? {
              ...shape,
              x: Math.min(100, Math.max(0, shape.x + dx)),
              y: Math.min(100, Math.max(0, shape.y + dy)),
            }
          : shape,
      ),
    );
  };

  const toPercent = (event: PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return { x: (event.clientX / box.width) * 100, y: (event.clientY / box.height) * 100 };
  };

  const onPointerDown = (event: PointerEvent<SVGGElement>, id: string) => {
    if (!editable) return;
    event.stopPropagation();
    onSelect?.(id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = toPercent(event);
    setDrag({ id, startX: start.x, startY: start.y, dx: 0, dy: 0 });
  };

  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
    if (!drag) return;
    const point = toPercent(event);
    setDrag({ ...drag, dx: point.x - drag.startX, dy: point.y - drag.startY });
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.dx !== 0 || drag.dy !== 0) moveBy(drag.id, drag.dx, drag.dy);
    setDrag(null);
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (!editable) return;
    const step = event.shiftKey ? NUDGE * 5 : NUDGE;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      event.stopPropagation();
      moveBy(id, move[0], move[1]);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange?.(shapes.filter((shape) => shape.id !== id));
      onSelect?.(null);
    }
  };

  if (shapes.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className={styles['shapes']}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden={editable ? undefined : true}
      data-testid="slide-shapes"
    >
      <defs>
        <marker
          id="deck-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={theme.accent} />
        </marker>
      </defs>
      {shapes.map((shape) => {
        const moving = drag?.id === shape.id;
        const offset = moving ? { x: px(drag.dx, 'x'), y: px(drag.dy, 'y') } : { x: 0, y: 0 };
        const selected = editable && selectedId === shape.id;
        const label = `${SHAPE_LABELS[shape.kind]}${shape.text ? `: ${shape.text}` : ''}`;
        return (
          <g
            key={shape.id}
            className={`${styles['shape']} ${editable ? styles['shapeEditable'] : ''}`}
            transform={`translate(${offset.x} ${offset.y})`}
            {...(editable
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': label,
                  'aria-pressed': selected,
                  onPointerDown: (event: PointerEvent<SVGGElement>) =>
                    onPointerDown(event, shape.id),
                  onPointerMove,
                  onPointerUp,
                  onKeyDown: (event: KeyboardEvent<SVGGElement>) => onKeyDown(event, shape.id),
                  onFocus: () => onSelect?.(shape.id),
                }
              : {})}
            data-testid={`slide-shape-${shape.id}`}
          >
            <ShapeGeometry shape={shape} theme={theme} />
            {shape.text && shape.kind !== 'line' && shape.kind !== 'arrow' ? (
              <text
                x={px(shape.x + shape.w / 2, 'x')}
                y={px(shape.y + shape.h / 2, 'y')}
                textAnchor="middle"
                dominantBaseline="central"
                fill={theme.text}
                fontSize={LABEL_SIZE}
              >
                {shape.text}
              </text>
            ) : null}
            {selected ? (
              <rect
                x={px(shape.x, 'x') - 10}
                y={px(shape.y, 'y') - 10}
                width={px(shape.w, 'x') + 20}
                height={px(shape.h, 'y') + 20}
                fill="none"
                stroke={theme.text}
                strokeDasharray="12 8"
                strokeWidth={3}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
