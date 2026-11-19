'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, Pencil, Square, Undo2, X } from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import { CAPTURE_ANNOTATOR_COPY as COPY } from '../capture-annotator';
import styles from './LocalCaptureAnnotator.module.css';

const GLYPH_SIZE = 15;
const IMAGE_TYPE = 'image/png';
const STROKE_DIVISOR = 400;
const MIN_STROKE = 2;
const TEXT_SCALE = 6;
const ARROW_HEAD_SCALE = 5;
const ARROW_HEAD_ANGLE = Math.PI / 7;

type Shape = 'rectangle' | 'ellipse' | 'arrow';
type Tool = 'pen' | 'shape' | 'text';
type Weight = 'fine' | 'medium' | 'bold';

const SHAPES: readonly Shape[] = ['rectangle', 'ellipse', 'arrow'];
const WEIGHTS: Readonly<Record<Weight, number>> = { fine: 1, medium: 2, bold: 4 };
const WEIGHT_ORDER: readonly Weight[] = ['fine', 'medium', 'bold'];

const SWATCHES = [
  { id: 'red', token: '--chat-destructive', label: COPY.colours.red },
  { id: 'amber', token: '--chat-warning', label: COPY.colours.amber },
  { id: 'green', token: '--chat-success', label: COPY.colours.green },
  { id: 'blue', token: '--chat-info', label: COPY.colours.blue },
  { id: 'text', token: '--chat-text-primary', label: COPY.colours.text },
  { id: 'page', token: '--chat-surface-base', label: COPY.colours.page },
] as const;

type SwatchId = (typeof SWATCHES)[number]['id'];

interface Point {
  x: number;
  y: number;
}

type Mark =
  | { kind: 'pen'; points: Point[]; colour: string; width: number }
  | { kind: Shape; from: Point; to: Point; colour: string; width: number }
  | { kind: 'text'; at: Point; text: string; colour: string; size: number };

function drawMark(context: CanvasRenderingContext2D, mark: Mark): void {
  context.strokeStyle = mark.colour;
  context.fillStyle = mark.colour;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (mark.kind === 'text') {
    context.font = `600 ${mark.size}px sans-serif`;
    context.textBaseline = 'top';
    context.fillText(mark.text, mark.at.x, mark.at.y);
    return;
  }
  context.lineWidth = mark.width;
  context.beginPath();
  if (mark.kind === 'pen') {
    const [first, ...rest] = mark.points;
    if (!first) return;
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    if (rest.length === 0) context.lineTo(first.x, first.y);
  } else if (mark.kind === 'rectangle') {
    context.rect(mark.from.x, mark.from.y, mark.to.x - mark.from.x, mark.to.y - mark.from.y);
  } else if (mark.kind === 'ellipse') {
    context.ellipse(
      (mark.from.x + mark.to.x) / 2,
      (mark.from.y + mark.to.y) / 2,
      Math.abs(mark.to.x - mark.from.x) / 2,
      Math.abs(mark.to.y - mark.from.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x);
    const head = mark.width * ARROW_HEAD_SCALE;
    context.moveTo(mark.from.x, mark.from.y);
    context.lineTo(mark.to.x, mark.to.y);
    for (const side of [-1, 1]) {
      context.moveTo(mark.to.x, mark.to.y);
      context.lineTo(
        mark.to.x - head * Math.cos(angle + side * ARROW_HEAD_ANGLE),
        mark.to.y - head * Math.sin(angle + side * ARROW_HEAD_ANGLE),
      );
    }
  }
  context.stroke();
}

export interface LocalCaptureAnnotatorProps {
  /** The capture to draw on, as a data URL. */
  image: string;
  /** The file name the annotated picture is attached under. */
  name: string;
  onAdd: (file: File) => void;
  onClose: () => void;
}

export function LocalCaptureAnnotator({ image, name, onAdd, onClose }: LocalCaptureAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pictureRef = useRef<HTMLImageElement | null>(null);
  const swatchRefs = useRef(new Map<SwatchId, HTMLButtonElement>());
  const drawing = useRef<Mark | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [shape, setShape] = useState<Shape>('rectangle');
  const [swatch, setSwatch] = useState<SwatchId>('red');
  const [weight, setWeight] = useState<Weight>('medium');
  const [typing, setTyping] = useState<{ at: Point; left: number; top: number } | null>(null);
  const [typed, setTyped] = useState('');
  const [adding, setAdding] = useState(false);

  const paint = useCallback((shown: readonly Mark[], extra: Mark | null) => {
    const canvas = canvasRef.current;
    const picture = pictureRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !picture || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    for (const mark of shown) drawMark(context, mark);
    if (extra) drawMark(context, extra);
  }, []);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setMarks([]);
    const picture = new Image();
    picture.onload = () => {
      pictureRef.current = picture;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = picture.naturalWidth;
        canvas.height = picture.naturalHeight;
      }
      setReady(true);
    };
    picture.onerror = () => setFailed(true);
    picture.src = image;
    return () => {
      picture.onload = null;
      picture.onerror = null;
    };
  }, [image]);

  useEffect(() => {
    if (ready) paint(marks, null);
  }, [ready, marks, paint]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || typing !== null) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, typing]);

  const strokeWidth = (): number => {
    const width = canvasRef.current?.width ?? 0;
    return Math.max(MIN_STROKE, width / STROKE_DIVISOR) * WEIGHTS[weight];
  };

  const colour = (): string => {
    const element = swatchRefs.current.get(swatch);
    return element ? getComputedStyle(element).backgroundColor : '';
  };

  const pointOf = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    const scaleX = box.width > 0 ? canvas.width / box.width : 1;
    const scaleY = box.height > 0 ? canvas.height / box.height : 1;
    return { x: (event.clientX - box.left) * scaleX, y: (event.clientY - box.top) * scaleY };
  };

  const commitText = () => {
    const text = typed.trim();
    if (typing && text !== '') {
      const mark: Mark = {
        kind: 'text',
        at: typing.at,
        text,
        colour: colour(),
        size: strokeWidth() * TEXT_SCALE,
      };
      setMarks((current) => [...current, mark]);
    }
    setTyping(null);
    setTyped('');
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || adding) return;
    const at = pointOf(event);
    if (tool === 'text') {
      if (typing) commitText();
      const box = event.currentTarget.getBoundingClientRect();
      setTyping({ at, left: event.clientX - box.left, top: event.clientY - box.top });
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current =
      tool === 'pen'
        ? { kind: 'pen', points: [at], colour: colour(), width: strokeWidth() }
        : { kind: shape, from: at, to: at, colour: colour(), width: strokeWidth() };
    paint(marks, drawing.current);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const mark = drawing.current;
    if (!mark || mark.kind === 'text') return;
    const at = pointOf(event);
    if (mark.kind === 'pen') mark.points.push(at);
    else mark.to = at;
    paint(marks, mark);
  };

  const onPointerUp = () => {
    const mark = drawing.current;
    drawing.current = null;
    if (mark) setMarks((current) => [...current, mark]);
  };

  const add = () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || adding) return;
    setAdding(true);
    canvas.toBlob((blob) => {
      setAdding(false);
      if (!blob) {
        setFailed(true);
        return;
      }
      onAdd(new File([blob], name, { type: IMAGE_TYPE, lastModified: Date.now() }));
    }, IMAGE_TYPE);
  };

  return (
    <div className={styles['annotator']} role="group" aria-label={COPY.title}>
      <div className={styles['stage']}>
        {failed ? (
          <p className={styles['message']} role="alert">
            {COPY.failed}
          </p>
        ) : (
          <div className={styles['sheet']}>
            <canvas
              ref={canvasRef}
              className={styles['canvas']}
              data-tool={tool}
              aria-label={COPY.canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {typing && (
              <input
                className={styles['textEntry']}
                style={{ left: typing.left, top: typing.top }}
                value={typed}
                autoFocus
                aria-label={COPY.textEntry}
                placeholder={COPY.textEntry}
                onChange={(event) => setTyped(event.target.value)}
                onBlur={commitText}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitText();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setTyping(null);
                    setTyped('');
                  }
                }}
              />
            )}
            {!ready && <Spinner size="sm" aria-label={COPY.loading} />}
          </div>
        )}
      </div>

      <div className={styles['toolbar']} role="toolbar" aria-label={COPY.tools}>
        <button
          type="button"
          className={`${styles['tool']} ${tool === 'pen' ? styles['toolActive'] : ''}`}
          aria-label={COPY.pen}
          aria-pressed={tool === 'pen'}
          title={COPY.pen}
          onClick={() => setTool('pen')}
        >
          <Pencil size={GLYPH_SIZE} aria-hidden="true" />
        </button>
        <span className={`${styles['toolGroup']} ${tool === 'shape' ? styles['toolActive'] : ''}`}>
          <button
            type="button"
            className={styles['tool']}
            aria-label={COPY.shapes[shape]}
            aria-pressed={tool === 'shape'}
            title={COPY.shapes[shape]}
            onClick={() => setTool('shape')}
          >
            <Square size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles['toolMore']} aria-label={COPY.chooseShape}>
                <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuRadioGroup
                value={shape}
                onValueChange={(value) => {
                  const chosen = SHAPES.find((entry) => entry === value);
                  if (!chosen) return;
                  setShape(chosen);
                  setTool('shape');
                }}
              >
                {SHAPES.map((entry) => (
                  <DropdownMenuRadioItem key={entry} value={entry}>
                    {COPY.shapes[entry]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <button
          type="button"
          className={`${styles['tool']} ${styles['toolWide']} ${tool === 'text' ? styles['toolActive'] : ''}`}
          aria-pressed={tool === 'text'}
          onClick={() => setTool('text')}
        >
          {COPY.text}
        </button>

        <span className={styles['divider']} aria-hidden="true" />

        <span className={styles['swatches']} role="radiogroup" aria-label={COPY.colour}>
          {SWATCHES.map((entry) => (
            <button
              key={entry.id}
              ref={(element) => {
                if (element) swatchRefs.current.set(entry.id, element);
                else swatchRefs.current.delete(entry.id);
              }}
              type="button"
              role="radio"
              className={`${styles['swatch']} ${swatch === entry.id ? styles['swatchActive'] : ''}`}
              style={{ background: `var(${entry.token})` }}
              aria-label={entry.label}
              aria-checked={swatch === entry.id}
              title={entry.label}
              onClick={() => setSwatch(entry.id)}
            />
          ))}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${styles['tool']} ${styles['toolWide']}`}
              aria-label={`${COPY.weight}: ${COPY.weights[weight]}`}
            >
              {COPY.weights[weight]}
              <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuRadioGroup
              value={weight}
              onValueChange={(value) => {
                const chosen = WEIGHT_ORDER.find((entry) => entry === value);
                if (chosen) setWeight(chosen);
              }}
            >
              {WEIGHT_ORDER.map((entry) => (
                <DropdownMenuRadioItem key={entry} value={entry}>
                  {COPY.weights[entry]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className={styles['tool']}
          aria-label={COPY.undo}
          title={COPY.undo}
          disabled={marks.length === 0}
          onClick={() => setMarks((current) => current.slice(0, -1))}
        >
          <Undo2 size={GLYPH_SIZE} aria-hidden="true" />
        </button>

        <span className={styles['spacer']} />

        <button
          type="button"
          className={styles['add']}
          disabled={!ready || failed || adding}
          onClick={add}
        >
          {adding ? <Spinner size="sm" aria-hidden="true" /> : null}
          {COPY.add}
        </button>
        <button
          type="button"
          className={styles['tool']}
          aria-label={COPY.close}
          title={COPY.close}
          onClick={onClose}
        >
          <X size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
