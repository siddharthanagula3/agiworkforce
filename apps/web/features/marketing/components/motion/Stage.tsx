'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { clamp, hasFinePointer, prefersReducedMotion } from './motionPreferences';

const MAX_TILT_DEG = 5;
const FOLLOW = 0.16;
const SETTLE_EPSILON = 0.02;
const TILT_X = '--agi-mx-rx';
const TILT_Y = '--agi-mx-ry';

type Vector = { x: number; y: number };

export function Stage({
  children,
  className,
  depthPx = 0,
}: {
  children: ReactNode;
  className?: string;
  depthPx?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || !hasFinePointer()) return;

    const target: Vector = { x: 0, y: 0 };
    const current: Vector = { x: 0, y: 0 };
    let frame = 0;

    const paint = () => {
      current.x += (target.x - current.x) * FOLLOW;
      current.y += (target.y - current.y) * FOLLOW;
      node.style.setProperty(TILT_X, `${current.x.toFixed(3)}deg`);
      node.style.setProperty(TILT_Y, `${current.y.toFixed(3)}deg`);
      const settled =
        Math.abs(target.x - current.x) < SETTLE_EPSILON &&
        Math.abs(target.y - current.y) < SETTLE_EPSILON;
      if (settled) {
        frame = 0;
        if (target.x === 0 && target.y === 0) node.style.removeProperty('will-change');
        return;
      }
      frame = requestAnimationFrame(paint);
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(paint);
    };

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      target.x = clamp(-py * MAX_TILT_DEG * 2, MAX_TILT_DEG);
      target.y = clamp(px * MAX_TILT_DEG * 2, MAX_TILT_DEG);
      schedule();
    };

    const onEnter = () => {
      node.style.willChange = 'transform';
    };

    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      schedule();
    };

    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    return () => {
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  const style = { '--agi-mx-depth': `${depthPx}px` } as CSSProperties;

  return (
    <div ref={ref} className={['agi-mx-stage', className].filter(Boolean).join(' ')} style={style}>
      <div className="agi-mx-body">{children}</div>
    </div>
  );
}
