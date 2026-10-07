'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import type { LaneId } from '@/features/marketing/components/system/lanes';
import {
  AVAILABILITY,
  CLAIM_ONE,
  CLAIM_TWO,
  CLI_TAG,
  DEFAULT_LANE,
  ILLUSTRATION_NOTE,
  LANES,
  PRIMARY,
  RECEIPT_HEADING,
  ROUTES_HEADING,
  SECONDARY,
  SURFACES,
  SURFACES_HEADING,
} from './content';

const MARK_SIZE = 160;
const MARK_CENTER = MARK_SIZE / 2;
const MARK_INNER = MARK_SIZE * 0.19;
const MARK_OUTER = MARK_SIZE * 0.375;
const MARK_STROKE = MARK_SIZE * 0.0625;
const MARK_SPOKES = 12;
const SPOKE_LENGTH = Number((MARK_OUTER - MARK_INNER).toFixed(2));
const DOT_SIZE = 20;
const PRESS_SETTLED_MS = 2500;
const RECEIPT_PRINT_START_MS = 1800;
const HOVER_SHIFT_PX = 3;

const spokes = Array.from({ length: MARK_SPOKES }, (_, i) => {
  const rad = (i * 2 * Math.PI) / MARK_SPOKES;
  const round = (value: number) => Number(value.toFixed(3));
  return {
    x1: round(MARK_CENTER + MARK_INNER * Math.sin(rad)),
    y1: round(MARK_CENTER - MARK_INNER * Math.cos(rad)),
    x2: round(MARK_CENTER + MARK_OUTER * Math.sin(rad)),
    y2: round(MARK_CENTER - MARK_OUTER * Math.cos(rad)),
    order: i === 0 ? MARK_SPOKES - 1 : i - 1,
    signature: i === 0,
  };
});

type BlockProps = {
  id: string;
  index: number;
  edge: 'left' | 'top' | 'right' | 'bottom';
  children: ReactNode;
  onHover: (el: HTMLElement | null) => void;
};

function Block({ id, index, edge, children, onHover }: BlockProps) {
  const style = { '--fr6-i': index } as CSSProperties;
  return (
    <div
      className={`fr6-block fr6-${id}`}
      data-edge={edge}
      style={style}
      onPointerEnter={(event) => onHover(event.currentTarget)}
      onPointerLeave={() => onHover(null)}
    >
      {children}
    </div>
  );
}

function Mark() {
  return (
    <svg
      className="fr6-mark"
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      width={MARK_SIZE}
      height={MARK_SIZE}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="The AGI mark"
      style={{ '--fr6-spoke-len': SPOKE_LENGTH } as CSSProperties}
    >
      {spokes.map((spoke) => (
        <line
          key={spoke.order}
          className={spoke.signature ? 'fr6-spoke fr6-spoke--signature' : 'fr6-spoke'}
          style={{ '--fr6-k': spoke.order } as CSSProperties}
          x1={spoke.x1}
          y1={spoke.y1}
          x2={spoke.x2}
          y2={spoke.y2}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeDasharray={SPOKE_LENGTH}
        />
      ))}
    </svg>
  );
}

export function BlocksPoster() {
  const [lane, setLane] = useState<LaneId>(DEFAULT_LANE);
  const [settled, setSettled] = useState(false);
  const [dotVars, setDotVars] = useState<CSSProperties | null>(null);
  const routesRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<LaneId, HTMLElement>());
  const radioRefs = useRef(new Map<LaneId, HTMLButtonElement>());
  const hovered = useRef<HTMLElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | undefined>(undefined);
  const interacted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), PRESS_SETTLED_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const measure = useCallback(() => {
    const routes = routesRef.current;
    const bar = barRefs.current.get(lane);
    if (!routes || !bar) return;
    const r = routes.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const y = b.top - r.top + b.height / 2 - DOT_SIZE / 2;
    setDotVars({
      '--fr6-dot-x0': `${Math.round(b.left - r.left + b.height / 2 - DOT_SIZE / 2)}px`,
      '--fr6-dot-x1': `${Math.round(b.right - r.left - DOT_SIZE / 2)}px`,
      '--fr6-dot-y': `${Math.round(y)}px`,
    } as CSSProperties);
  }, [lane]);

  useLayoutEffect(() => {
    measure();
    const routes = routesRef.current;
    if (!routes) return;
    const observer = new ResizeObserver(measure);
    observer.observe(routes);
    return () => observer.disconnect();
  }, [measure]);

  const select = (next: LaneId) => {
    interacted.current = true;
    setSettled(true);
    setLane(next);
  };

  const onRouteKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const ids = LANES.map((item) => item.id);
    const at = ids.indexOf(lane);
    let next: LaneId | undefined;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = ids[(at + 1) % ids.length];
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = ids[(at - 1 + ids.length) % ids.length];
    if (event.key === 'Home') next = ids[0];
    if (event.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next);
    radioRefs.current.get(next)?.focus();
  };

  const applyShift = useCallback(() => {
    frame.current = undefined;
    const el = hovered.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(
      -1,
      Math.min(1, (pointer.current.x - (rect.left + rect.width / 2)) / (rect.width / 2)),
    );
    const ny = Math.max(
      -1,
      Math.min(1, (pointer.current.y - (rect.top + rect.height / 2)) / (rect.height / 2)),
    );
    el.style.transform = `translate(${(nx * HOVER_SHIFT_PX).toFixed(1)}px, ${(ny * HOVER_SHIFT_PX).toFixed(1)}px)`;
  }, []);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (hovered.current && frame.current === undefined) {
      frame.current = window.requestAnimationFrame(applyShift);
    }
  };

  const onHover = useCallback((el: HTMLElement | null) => {
    if (hovered.current && hovered.current !== el) hovered.current.style.transform = '';
    hovered.current = el;
    if (!el && frame.current !== undefined) {
      window.cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const activeLane = LANES.find((item) => item.id === lane) ?? LANES[0];
  const receiptStyle = {
    '--fr6-print-base': interacted.current ? '0ms' : `${RECEIPT_PRINT_START_MS}ms`,
  } as CSSProperties;
  if (!activeLane) return null;

  return (
    <section className="fr6-stage" aria-label="AGI: one AI workspace, you choose where it runs">
      <div
        className="fr6-grid"
        onPointerMove={onPointerMove}
        data-settled={settled ? '' : undefined}
      >
        <Block id="b1" index={0} edge="left" onHover={onHover}>
          <h1 className="fr6-claim fr6-claim--one fr6-rise">{CLAIM_ONE}</h1>
        </Block>

        <Block id="b2" index={1} edge="top" onHover={onHover}>
          <div className="fr6-mark-wrap">
            <Mark />
          </div>
          <p className="fr6-wordmark fr6-rise" aria-hidden="true">
            AGI
          </p>
        </Block>

        <Block id="b3" index={2} edge="right" onHover={onHover}>
          <p className="fr6-claim fr6-claim--two fr6-rise">{CLAIM_TWO}</p>
        </Block>

        <Block id="b4" index={3} edge="left" onHover={onHover}>
          <p className="fr6-block-head fr6-rise">{ROUTES_HEADING}</p>
          <div
            ref={routesRef}
            className="fr6-routes fr6-rise"
            role="radiogroup"
            aria-label={ROUTES_HEADING}
            onKeyDown={onRouteKey}
          >
            {LANES.map((item) => (
              <button
                key={item.id}
                ref={(el) => {
                  if (el) radioRefs.current.set(item.id, el);
                  else radioRefs.current.delete(item.id);
                }}
                type="button"
                role="radio"
                aria-checked={lane === item.id}
                tabIndex={lane === item.id ? 0 : -1}
                className="fr6-route"
                onPointerEnter={() => select(item.id)}
                onClick={() => select(item.id)}
                onFocus={() => select(item.id)}
              >
                <span className="fr6-route-label">
                  <span className="fr6-lane-name">{item.name}</span>
                  {!item.live && <span className="fr6-tag">{CLI_TAG}</span>}
                </span>
                <span
                  className="fr6-bar"
                  ref={(el) => {
                    if (el) barRefs.current.set(item.id, el);
                    else barRefs.current.delete(item.id);
                  }}
                />
              </button>
            ))}
            {dotVars && (
              <span
                className={settled ? 'fr6-dot' : 'fr6-dot fr6-dot--press'}
                style={dotVars}
                aria-hidden="true"
              />
            )}
          </div>
        </Block>

        <Block id="b5" index={4} edge="top" onHover={onHover}>
          <div className="fr6-receipt" key={lane} style={receiptStyle} aria-live="polite">
            <p className="fr6-receipt-head fr6-print" style={{ '--fr6-k': 0 } as CSSProperties}>
              <span className="fr6-receipt-title">{RECEIPT_HEADING}</span>
              <span className="fr6-receipt-lane">{activeLane.name}</span>
            </p>
            <dl className="fr6-rows">
              {activeLane.rows.map((row, i) => (
                <div
                  key={row.label}
                  className="fr6-row fr6-print"
                  style={{ '--fr6-k': i + 1 } as CSSProperties}
                >
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="fr6-receipt-foot fr6-print" style={{ '--fr6-k': 5 } as CSSProperties}>
              {activeLane.note && <span className="fr6-cli-note">{activeLane.note}</span>}
              <span className="fr6-illo-note">{ILLUSTRATION_NOTE}</span>
            </p>
          </div>
        </Block>

        <Block id="b6" index={5} edge="right" onHover={onHover}>
          <p className="fr6-block-head fr6-rise">{SURFACES_HEADING}</p>
          <ul className="fr6-surfaces fr6-rise">
            {SURFACES.map((surface) => (
              <li
                key={surface.id}
                className="fr6-surface"
                data-live={surface.live ? '' : undefined}
              >
                <span className="fr6-surface-dot" aria-hidden="true" />
                <span className="fr6-surface-name">{surface.name}</span>
                <span className="fr6-surface-status">{surface.status}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block id="b7" index={6} edge="bottom" onHover={onHover}>
          <div className="fr6-actions fr6-rise">
            <Link href={PRIMARY.href} className="fr6-btn fr6-btn--primary">
              {PRIMARY.label}
            </Link>
            <Link href={SECONDARY.href} className="fr6-btn fr6-btn--secondary">
              {SECONDARY.label}
            </Link>
            <p className="fr6-availability">{AVAILABILITY}</p>
          </div>
        </Block>

        <Block id="b8" index={7} edge="bottom" onHover={onHover}>
          <span className="fr6-half fr6-rise" aria-hidden="true" />
        </Block>
      </div>
    </section>
  );
}
