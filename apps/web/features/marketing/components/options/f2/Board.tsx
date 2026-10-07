'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import { ArrowUp, FileText, RotateCcw } from 'lucide-react';
import { prefersReducedMotion } from '@/features/marketing/components/motion/motionPreferences';
import type { LaneId } from '@/features/marketing/components/system/lanes';
import type { BoardLane } from './content';
import { offsetsByLength, pointAt, roundedPath, simplify, type Point } from './path';

const DEFAULT_LANE: LaneId = 'cloud';
const START_DELAY_MS = 400;
const SEND_MS = 160;
const TRAVEL_MS = 900;
const SETTLE_MS = 120;
const PRINT_DELAY_MS = 200;
const LIT_DELAY_MS = 700;
const CORNER = 12;
const EMERGE = 0.1;
const EMERGE_SCALE = 0.6;
const ANCHOR_INSET = 14;
const TRAVEL_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const RAIL_INSET = 20;
const RAIL_GAP = 16;
const STACK_TOLERANCE = 2;
const FILE_ICON = 16;
const SEND_ICON = 18;
const REPLAY_ICON = 16;

type Origin = 'composer' | LaneId;

type BoardProps = {
  headline: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  prompt: string;
  attachment: string;
  attachmentPages: string;
  chipText: string;
  chipTextShort: string;
  illustration: string;
  note: string;
  lanes: readonly BoardLane[];
};

type LaneNodes<T> = Partial<Record<LaneId, T>>;

type Route = { points: Point[]; stacked: boolean };

const anchorOf = (rect: DOMRect, frame: DOMRect, stacked: boolean): Point => ({
  x: (stacked ? rect.left + ANCHOR_INSET : rect.right - ANCHOR_INSET) - frame.left,
  y: rect.top - frame.top + rect.height / 2,
});

export function Board({
  headline,
  primary,
  secondary,
  prompt,
  attachment,
  attachmentPages,
  chipText,
  chipTextShort,
  illustration,
  note,
  lanes,
}: BoardProps) {
  const chipLabel = (
    <>
      <span className="f2-chip-long">{chipText}</span>
      <span className="f2-chip-short">{chipTextShort}</span>
    </>
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const litRef = useRef<SVGPathElement>(null);
  const tabRefs = useRef<LaneNodes<HTMLDivElement>>({});
  const plateRefs = useRef<LaneNodes<HTMLDivElement>>({});
  const slotRefs = useRef<LaneNodes<HTMLSpanElement>>({});
  const timers = useRef<number[]>([]);
  const animations = useRef<Animation[]>([]);
  const runningRef = useRef(false);
  const originRef = useRef<Origin>('composer');
  const activeRef = useRef<LaneId>(DEFAULT_LANE);

  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState<LaneId>(DEFAULT_LANE);
  const [docked, setDocked] = useState<LaneId | null>(DEFAULT_LANE);
  const [printed, setPrinted] = useState(true);
  const [lit, setLit] = useState<LaneId | null>(DEFAULT_LANE);
  const [pathD, setPathD] = useState('');
  const [pathLane, setPathLane] = useState<LaneId>(DEFAULT_LANE);
  const [sendPressed, setSendPressed] = useState(false);

  activeRef.current = active;

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const cancelAnimations = useCallback(() => {
    for (const animation of animations.current) animation.cancel();
    animations.current = [];
  }, []);

  const route = useCallback(
    (origin: Origin, target: LaneId): Route | null => {
      const stage = stageRef.current;
      const board = boardRef.current;
      const send = sendRef.current;
      const slot = slotRefs.current[target];
      const firstLane = lanes[0]?.id;
      const secondLane = lanes[1]?.id;
      const firstTab = firstLane ? tabRefs.current[firstLane] : undefined;
      const firstPlate = firstLane ? plateRefs.current[firstLane] : undefined;
      const secondPlate = secondLane ? plateRefs.current[secondLane] : undefined;
      if (!stage || !board || !send || !slot || !firstTab || !firstPlate) return null;

      const frame = stage.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const tabRect = firstTab.getBoundingClientRect();
      const plateRect = firstPlate.getBoundingClientRect();
      const stacked = secondPlate
        ? Math.abs(secondPlate.getBoundingClientRect().top - plateRect.top) > STACK_TOLERANCE
        : false;
      const end = anchorOf(slot.getBoundingClientRect(), frame, stacked);

      let start: Point;
      if (origin === 'composer') {
        const sendRect = send.getBoundingClientRect();
        start = {
          x: sendRect.left - frame.left + sendRect.width / 2,
          y: sendRect.top - frame.top + sendRect.height,
        };
      } else {
        const originSlot = slotRefs.current[origin];
        if (!originSlot) return null;
        start = anchorOf(originSlot.getBoundingClientRect(), frame, stacked);
      }

      if (!stacked) {
        const railY = (tabRect.bottom + plateRect.top) / 2 - frame.top;
        return {
          stacked,
          points: simplify([start, { x: start.x, y: railY }, { x: end.x, y: railY }, end]),
        };
      }

      const railX = boardRect.left - frame.left + RAIL_INSET;
      if (origin === 'composer') {
        const topY = boardRect.top - frame.top - RAIL_GAP;
        return {
          stacked,
          points: simplify([
            start,
            { x: start.x, y: topY },
            { x: railX, y: topY },
            { x: railX, y: end.y },
            end,
          ]),
        };
      }
      return {
        stacked,
        points: simplify([start, { x: railX, y: start.y }, { x: railX, y: end.y }, end]),
      };
    },
    [lanes],
  );

  const chipTransform = useCallback((point: Point, scale: number, stacked: boolean): string => {
    const chip = chipRef.current;
    if (!chip) return '';
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    const anchor = stacked ? ANCHOR_INSET : w - ANCHOR_INSET;
    return `translate(${point.x - anchor}px, ${point.y - h / 2}px) scale(${scale})`;
  }, []);

  const placeChip = useCallback(
    (point: Point, scale: number, visible: boolean, stacked: boolean) => {
      const chip = chipRef.current;
      if (!chip) return;
      chip.style.transformOrigin = stacked
        ? `${ANCHOR_INSET}px 50%`
        : `calc(100% - ${ANCHOR_INSET}px) 50%`;
      chip.style.transform = chipTransform(point, scale, stacked);
      chip.style.opacity = visible ? '1' : '0';
    },
    [chipTransform],
  );

  const animateChip = useCallback(
    (points: Point[], emerge: boolean, stacked: boolean): Animation | null => {
      const chip = chipRef.current;
      const start = points[0];
      if (!chip || !start) return null;
      const at = (p: Point, scale: number) => chipTransform(p, scale, stacked);
      const offsets = offsetsByLength(points);
      const frames: Keyframe[] = [];
      if (emerge) {
        frames.push({ transform: at(start, EMERGE_SCALE), opacity: 0, offset: 0 });
        frames.push({ transform: at(pointAt(points, EMERGE), 1), opacity: 1, offset: EMERGE });
        points.forEach((p, i) => {
          const offset = offsets[i] ?? 0;
          if (offset > EMERGE) frames.push({ transform: at(p, 1), opacity: 1, offset });
        });
      } else {
        points.forEach((p, i) =>
          frames.push({ transform: at(p, 1), opacity: 1, offset: offsets[i] ?? 0 }),
        );
      }
      const final = frames[frames.length - 1];
      if (final) final.offset = 1;
      return chip.animate(frames, { duration: TRAVEL_MS, easing: TRAVEL_EASE, fill: 'forwards' });
    },
    [chipTransform],
  );

  const animateLit = useCallback((): Animation | null => {
    const path = litRef.current;
    if (!path) return null;
    return path.animate(
      [
        { strokeDashoffset: 1, offset: 0 },
        { strokeDashoffset: 0, offset: 1 },
      ],
      { duration: TRAVEL_MS, easing: TRAVEL_EASE, fill: 'forwards' },
    );
  }, []);

  const apply = useCallback(
    (origin: Origin, target: LaneId) => {
      const found = route(origin, target);
      if (!found) return;
      originRef.current = origin;
      setPathLane(target);
      setPathD(roundedPath(found.points, CORNER));
      setActive(target);
      setDocked(target);
      setPrinted(true);
      setLit(target);
    },
    [route],
  );

  const run = useCallback(
    (origin: Origin, target: LaneId) => {
      if (runningRef.current) return;
      const found = route(origin, target);
      if (!found) return;
      const { points, stacked } = found;
      const start = points[0];
      if (!start) return;
      runningRef.current = true;
      clearTimers();
      cancelAnimations();
      originRef.current = origin;
      const emerge = origin === 'composer';
      setPathLane(target);
      setPathD(roundedPath(points, CORNER));
      setActive(target);
      setPrinted(false);
      setLit(null);
      setDocked(null);
      placeChip(start, emerge ? EMERGE_SCALE : 1, !emerge, stacked);
      if (emerge) {
        setSendPressed(true);
        later(SEND_MS, () => setSendPressed(false));
      }
      later(emerge ? SEND_MS : 0, () => {
        const chip = animateChip(points, emerge, stacked);
        const path = animateLit();
        if (chip) animations.current.push(chip);
        if (path) animations.current.push(path);
        later(TRAVEL_MS + SETTLE_MS, () => {
          setDocked(target);
          later(PRINT_DELAY_MS, () => setPrinted(true));
          later(LIT_DELAY_MS, () => {
            setLit(target);
            runningRef.current = false;
          });
        });
      });
    },
    [animateChip, animateLit, cancelAnimations, clearTimers, later, placeChip, route],
  );

  const runRef = useRef(run);
  const applyRef = useRef(apply);
  runRef.current = run;
  applyRef.current = apply;

  useLayoutEffect(() => {
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);
    setReady(true);
    if (!isReduced) {
      setDocked(null);
      setPrinted(false);
      setLit(null);
    }
  }, []);

  useLayoutEffect(() => {
    if (docked === null) return;
    const chip = chipRef.current;
    if (chip) chip.style.opacity = '0';
    for (const animation of animations.current) {
      const effect = animation.effect;
      if (effect instanceof KeyframeEffect && effect.target === chip) animation.cancel();
    }
  }, [docked]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      if (reduced) applyRef.current('composer', DEFAULT_LANE);
      else later(START_DELAY_MS, () => runRef.current('composer', DEFAULT_LANE));
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts) {
      fonts.ready.then(start);
    } else {
      start();
    }
    return () => {
      cancelled = true;
      clearTimers();
      cancelAnimations();
    };
  }, [ready, reduced, later, clearTimers, cancelAnimations]);

  useEffect(() => {
    if (!ready) return;
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (runningRef.current) return;
      const found = route(originRef.current, activeRef.current);
      if (found) setPathD(roundedPath(found.points, CORNER));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ready, route]);

  const choose = (lane: LaneId) => {
    if (lane === active) return;
    if (reduced) applyRef.current(active, lane);
    else runRef.current(active, lane);
  };

  const replay = () => {
    if (reduced) return;
    runRef.current('composer', active);
  };

  return (
    <div ref={stageRef} className="f2-stage" data-ready={ready} data-reduced={reduced}>
      <div className="f2-hero-grid">
        <div className="f2-hero-copy">
          <h1 className="f2-h1">{headline}</h1>
          <div className="f2-actions">
            <Link href={primary.href} className="f2-btn f2-btn--primary">
              {primary.label}
            </Link>
            <Link href={secondary.href} className="f2-btn f2-btn--secondary">
              {secondary.label}
            </Link>
          </div>
        </div>
        <figure
          className="f2-composer"
          data-illustration
          aria-label="Illustration of the composer holding one request"
        >
          <div className="f2-composer-top">
            <span className="f2-file">
              <FileText size={FILE_ICON} strokeWidth={2} aria-hidden="true" />
              <span>{attachment}</span>
              <span className="f2-file-pages">{attachmentPages}</span>
            </span>
            <span className="f2-illus">{illustration}</span>
          </div>
          <p className="f2-prompt">{prompt}</p>
          <div className="f2-composer-bar">
            <span className="f2-auto">Auto</span>
            <span ref={sendRef} className="f2-send" data-pressed={sendPressed} aria-hidden="true">
              <ArrowUp size={SEND_ICON} strokeWidth={2.25} />
            </span>
          </div>
        </figure>
      </div>

      <div ref={boardRef} className="f2-board" data-illustration>
        <div className="f2-board-grid">
          {lanes.map((lane) => (
            <div
              key={`tab-${lane.id}`}
              className="f2-tab"
              data-lane={lane.id}
              ref={(node) => {
                tabRefs.current[lane.id] = node ?? undefined;
              }}
            >
              <button
                type="button"
                className="f2-tab-btn"
                aria-pressed={active === lane.id}
                onClick={() => choose(lane.id)}
              >
                <i className="f2-square" aria-hidden="true" />
                <span className="f2-tab-name">{lane.name}</span>
              </button>
              <span className="f2-tab-status">{lane.status}</span>
            </div>
          ))}
          {lanes.map((lane) => (
            <div
              key={`plate-${lane.id}`}
              className="f2-plate"
              data-lane={lane.id}
              data-lit={lit === lane.id}
              data-active={active === lane.id}
              ref={(node) => {
                plateRefs.current[lane.id] = node ?? undefined;
              }}
            >
              <div className="f2-dock">
                <div className="f2-slot">
                  <i className="f2-dot" aria-hidden="true" />
                  <span
                    ref={(node) => {
                      slotRefs.current[lane.id] = node ?? undefined;
                    }}
                    className="f2-chip f2-chip--slot"
                    data-visible={docked === lane.id}
                    aria-hidden="true"
                  >
                    {chipLabel}
                  </span>
                </div>
                <ol className="f2-receipt" data-printed={active === lane.id ? printed : true}>
                  {lane.receipt.map((line, index) => (
                    <li
                      key={index}
                      className="f2-receipt-line"
                      style={{ '--i': index } as CSSProperties}
                    >
                      {line}
                    </li>
                  ))}
                </ol>
              </div>
              <dl className="f2-specs f2-specs--plate">
                {lane.rows.map((row) => (
                  <div key={row.label} className="f2-spec">
                    <dt className="f2-label">{row.label}</dt>
                    <dd className="f2-text">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
      <div className="f2-board-foot">
        <p className="f2-label f2-board-note">{note}</p>
        <button
          type="button"
          className="f2-replay"
          aria-label="Replay the request crossing the board"
          onClick={replay}
        >
          <RotateCcw size={REPLAY_ICON} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <svg className="f2-paths" aria-hidden="true" focusable="false">
        <path className="f2-path-base" d={pathD} />
        <path ref={litRef} className="f2-path-lit" data-lane={pathLane} d={pathD} pathLength={1} />
      </svg>
      <div ref={chipRef} className="f2-chip f2-chip--fly" aria-hidden="true">
        {chipLabel}
      </div>
    </div>
  );
}
