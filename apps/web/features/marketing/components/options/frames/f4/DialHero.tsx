'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ProviderMark } from '@agiworkforce/ui';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { prefersReducedMotion } from '@/features/marketing/components/motion/motionPreferences';
import type { DialStop } from './content';
import {
  crossedTicks,
  nearestEquivalent,
  nearestStop,
  POSITIONS,
  stopAngle,
  stepSpring,
  type SpringState,
} from './spring';

const FACE_R = 260;
const TICK_IN = 200;
const TICK_OUT = 244;
const TICK_W = 10;
const NEEDLE_W = 12;
const NEEDLE_LEN = 236;
const NEEDLE_TIP = 36;
const COUNTERWEIGHT = 72;
const WEIGHT_R = 16;
const HUB_MARK = 40;
const PROVIDER_MARK = 24;
const SWEEP_START_MS = 450;
const SWEEP_FROM = 210;
const SWEEP_TO = 360;
const SWEEP_KICK = 220;
const TICK_FLASH_MS = 90;
const DRAG_FOLLOW = 0.42;

const vars = (values: Record<string, number | string>) => values as CSSProperties;

interface DialHeroProps {
  claimLines: readonly string[];
  stops: readonly DialStop[];
  readoutTitle: string;
  note: string;
  primary: { readonly label: string; readonly href: string };
  secondary: { readonly label: string; readonly href: string };
  availability: string;
  dialLabel: string;
}

function Face({ faceRef }: { faceRef: React.RefObject<SVGSVGElement | null> }) {
  const ticks = Array.from({ length: POSITIONS }, (_, index) => {
    const angle = (index * 2 * Math.PI) / POSITIONS;
    return {
      x1: (TICK_IN * Math.sin(angle)).toFixed(2),
      y1: (-TICK_IN * Math.cos(angle)).toFixed(2),
      x2: (TICK_OUT * Math.sin(angle)).toFixed(2),
      y2: (-TICK_OUT * Math.cos(angle)).toFixed(2),
    };
  });
  return (
    <svg
      ref={faceRef}
      className="fr4-face"
      viewBox={`${-FACE_R} ${-FACE_R} ${FACE_R * 2} ${FACE_R * 2}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle r={FACE_R} className="fr4-face-disc" />
      {ticks.map((tick, index) => (
        <line
          key={index}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          pathLength={100}
          strokeWidth={TICK_W}
          strokeLinecap="round"
          className="fr4-tick"
          style={vars({ '--fr4-i': index })}
        />
      ))}
    </svg>
  );
}

function Needle({ needleRef }: { needleRef: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg
      ref={needleRef}
      className="fr4-needle"
      viewBox={`${-FACE_R} ${-FACE_R} ${FACE_R * 2} ${FACE_R * 2}`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={0}
        y1={COUNTERWEIGHT}
        x2={0}
        y2={-(NEEDLE_LEN - NEEDLE_TIP)}
        strokeWidth={NEEDLE_W}
        strokeLinecap="round"
        className="fr4-needle-bar"
      />
      <line
        x1={0}
        y1={-(NEEDLE_LEN - NEEDLE_TIP)}
        x2={0}
        y2={-NEEDLE_LEN}
        strokeWidth={NEEDLE_W}
        strokeLinecap="round"
        className="fr4-needle-tip"
      />
      <circle r={WEIGHT_R} cy={COUNTERWEIGHT} className="fr4-needle-weight" />
    </svg>
  );
}

export function DialHero({
  claimLines,
  stops,
  readoutTitle,
  note,
  primary,
  secondary,
  availability,
  dialLabel,
}: DialHeroProps) {
  const [position, setPosition] = useState(0);
  const [printed, setPrinted] = useState(0);
  const [ready, setReady] = useState(false);
  const faceRef = useRef<SVGSVGElement>(null);
  const needleRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spring = useRef<SpringState>({ angle: SWEEP_FROM, velocity: 0, target: SWEEP_TO });
  const frame = useRef(0);
  const lastTime = useRef(0);
  const dragging = useRef(false);
  const dragTarget = useRef(0);
  const reduced = useRef(false);
  const pendingStop = useRef(0);
  const flashTimers = useRef<number[]>([]);

  const paint = useCallback(() => {
    const needle = needleRef.current;
    if (needle) needle.style.transform = `rotate(${spring.current.angle.toFixed(3)}deg)`;
  }, []);

  const flash = useCallback((indices: number[]) => {
    const face = faceRef.current;
    if (!face || indices.length === 0) return;
    const ticks = face.querySelectorAll<SVGLineElement>('.fr4-tick');
    for (const index of indices) {
      const tick = ticks[index];
      if (!tick) continue;
      tick.classList.add('fr4-tick-hit');
      const timer = window.setTimeout(() => tick.classList.remove('fr4-tick-hit'), TICK_FLASH_MS);
      flashTimers.current.push(timer);
    }
  }, []);

  const settle = useCallback(() => {
    setPrinted(pendingStop.current);
    setReady(true);
  }, []);

  const loop = useCallback(
    (now: number) => {
      frame.current = 0;
      const elapsed = lastTime.current === 0 ? 16 : now - lastTime.current;
      lastTime.current = now;
      const state = spring.current;
      const before = state.angle;
      let resting = false;
      if (dragging.current) {
        state.angle += (dragTarget.current - state.angle) * DRAG_FOLLOW;
        state.velocity = 0;
      } else {
        resting = stepSpring(state, elapsed);
      }
      flash(crossedTicks(before, state.angle));
      paint();
      if (resting) {
        lastTime.current = 0;
        settle();
        return;
      }
      frame.current = window.requestAnimationFrame(loop);
    },
    [flash, paint, settle],
  );

  const run = useCallback(() => {
    if (frame.current === 0) {
      lastTime.current = 0;
      frame.current = window.requestAnimationFrame(loop);
    }
  }, [loop]);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(stops.length - 1, index));
      setPosition(clamped);
      pendingStop.current = clamped;
      const state = spring.current;
      state.target = stopAngle(clamped, state.angle);
      if (reduced.current) {
        state.angle = state.target;
        state.velocity = 0;
        paint();
        settle();
        return;
      }
      run();
    },
    [paint, run, settle, stops.length],
  );

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const state = spring.current;
    const timers = flashTimers.current;
    if (reduced.current) {
      state.angle = 0;
      state.velocity = 0;
      state.target = 0;
      paint();
      settle();
      return;
    }
    state.angle = SWEEP_FROM;
    state.velocity = 0;
    state.target = SWEEP_TO;
    paint();
    const kick = window.setTimeout(() => {
      spring.current.velocity = SWEEP_KICK;
      run();
    }, SWEEP_START_MS);
    return () => {
      window.clearTimeout(kick);
      if (frame.current !== 0) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [paint, run, settle]);

  const pointerAngle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return spring.current.angle;
    const rect = wrap.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return nearestEquivalent(degrees, spring.current.angle);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced.current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    dragTarget.current = pointerAngle(event);
    run();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragTarget.current = pointerAngle(event);
    run();
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    goTo(nearestStop(spring.current.angle, stops.length));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: position + 1,
      ArrowUp: position + 1,
      ArrowLeft: position - 1,
      ArrowDown: position - 1,
      Home: 0,
      End: stops.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goTo(next);
  };

  const active = stops[position] ?? stops[0];
  const shown = stops[printed] ?? stops[0];
  if (!active || !shown) return null;

  return (
    <section className="fr4-hero" aria-label="AGI, every model, one composer">
      <div className="fr4-copy">
        <h1 className="fr4-claim">
          {claimLines.map((line) => (
            <span key={line} className="fr4-claim-line">
              {line}
            </span>
          ))}
        </h1>
        <div className="fr4-readout" data-illustration data-printed={ready ? 'true' : undefined}>
          <p className="fr4-readout-title">{readoutTitle}</p>
          <dl className="fr4-rows" key={shown.id}>
            {shown.rows.map((row, index) => (
              <div
                key={row.key}
                className="fr4-row"
                data-lane={row.lane}
                style={vars({ '--fr4-i': index })}
              >
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="fr4-note">{note}</p>
        </div>
        <div className="fr4-actions">
          <Link href={primary.href} className="fr4-btn fr4-btn-primary">
            {primary.label}
          </Link>
          <Link href={secondary.href} className="fr4-btn fr4-btn-secondary">
            {secondary.label}
          </Link>
        </div>
        <p className="fr4-availability">{availability}</p>
      </div>
      <div className="fr4-stage" data-illustration>
        <div className="fr4-sign-row">
          <button
            type="button"
            className="fr4-step"
            aria-label="Previous position"
            onClick={() => goTo(position - 1)}
            disabled={position === 0}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className="fr4-sign" aria-live="polite">
            {active.providerKey ? (
              <ProviderMark providerKey={active.providerKey} size={PROVIDER_MARK} />
            ) : null}
            <span>{active.label}</span>
          </p>
          <button
            type="button"
            className="fr4-step"
            aria-label="Next position"
            onClick={() => goTo(position + 1)}
            disabled={position === stops.length - 1}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="fr4-dial-area">
          <div
            ref={wrapRef}
            className="fr4-dial"
            role="slider"
            tabIndex={0}
            aria-label={dialLabel}
            aria-valuemin={0}
            aria-valuemax={stops.length - 1}
            aria-valuenow={position}
            aria-valuetext={active.label}
            aria-orientation="horizontal"
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <Face faceRef={faceRef} />
            <Needle needleRef={needleRef} />
            <div className="fr4-hub">
              <AgiMark size={HUB_MARK} ariaLabel="AGI mark" />
            </div>
          </div>
          <div className="fr4-labels">
            {stops.map((stop, index) => (
              <button
                key={stop.id}
                type="button"
                className="fr4-label"
                data-pos={index}
                data-anchor={index === 0 || index === 6 ? 'centre' : index < 6 ? 'start' : 'end'}
                aria-pressed={index === position}
                style={vars({ '--fr4-i': index })}
                onClick={() => goTo(index)}
              >
                {stop.providerKey ? (
                  <ProviderMark providerKey={stop.providerKey} size={PROVIDER_MARK} />
                ) : null}
                <span>{stop.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
