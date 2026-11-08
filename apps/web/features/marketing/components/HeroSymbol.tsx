'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotionFlag } from '@agiworkforce/ui/auth-scene';
import { agiMotion, agiRibbonMotion } from '@agiworkforce/design-tokens';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { createRibbonMesh } from './ribbon-mesh';

export function HeroSymbol() {
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'static'>('loading');
  const rootRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const reconcileRef = useRef<(() => void) | null>(null);
  const reduceMotion = useReducedMotionFlag();
  const action = paused ? 'Resume symbol animation' : 'Pause symbol animation';

  useEffect(() => {
    pausedRef.current = paused;
    reconcileRef.current?.();
  }, [paused]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const image = root?.querySelector('img');
    if (
      reduceMotion !== false ||
      !root ||
      !canvas ||
      !image ||
      !('WebGLRenderingContext' in window)
    ) {
      setStatus('static');
      return;
    }
    let renderer: ReturnType<typeof createRibbonMesh> | undefined;
    let frame = 0;
    let elapsed = 0;
    let previous: number | undefined;
    let visible = true;
    let failed = false;
    let disposed = false;
    const duration = parseFloat(agiMotion.duration.markFlow);
    const entryDuration = parseFloat(agiMotion.duration.quick);

    const active = () =>
      renderer && !pausedRef.current && visible && !document.hidden && !failed && !disposed;
    const draw = () => renderer?.draw(elapsed / duration, Math.min(1, elapsed / entryDuration));
    const tick = (time: number) => {
      frame = 0;
      if (!active()) return;
      if (previous !== undefined) elapsed += time - previous;
      previous = time;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const reconcile = () => {
      if (!active()) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = undefined;
      } else if (!frame) {
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      const bounds = root.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, agiRibbonMotion.pixelRatioLimit);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      draw();
    };
    const fail = () => {
      failed = true;
      reconcile();
      setStatus('static');
    };
    const initialize = () => {
      if (disposed || renderer || !image.naturalWidth) return;
      try {
        renderer = createRibbonMesh(canvas, image);
        resize();
        setStatus('ready');
        reconcile();
      } catch {
        fail();
      }
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      reconcile();
    });
    reconcileRef.current = reconcile;
    resizeObserver.observe(root);
    intersectionObserver.observe(root);
    canvas.addEventListener('webglcontextlost', contextLost);
    image.addEventListener('load', initialize);
    image.addEventListener('error', fail);
    document.addEventListener('visibilitychange', reconcile);
    if (image.complete) initialize();

    return () => {
      disposed = true;
      reconcile();
      reconcileRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      image.removeEventListener('load', initialize);
      image.removeEventListener('error', fail);
      document.removeEventListener('visibilitychange', reconcile);
      renderer?.dispose();
    };
  }, [reduceMotion]);

  return (
    <button
      type="button"
      ref={rootRef}
      className="agi-fl-hero-symbol"
      data-motion={status}
      disabled={status !== 'ready'}
      aria-label={status === 'ready' ? action : PRODUCT_BRAND}
      title={status === 'ready' ? action : PRODUCT_BRAND}
      onClick={() => setPaused((value) => !value)}
    >
      <AgiMark className="agi-fl-hero-brand-mark" ariaLabel={PRODUCT_BRAND} />
      <canvas ref={canvasRef} className="agi-fl-ribbon-mesh" aria-hidden="true" />
    </button>
  );
}
