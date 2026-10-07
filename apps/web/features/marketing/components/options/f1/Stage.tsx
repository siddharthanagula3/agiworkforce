'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/features/marketing/components/motion/motionPreferences';
import type { Chapter } from './content';

const PINNED_QUERY = '(min-width: 901px) and (prefers-reduced-motion: no-preference)';
const FIRST = 0;
const SCROLL_LOCK_MS = 800;
const RAIL_LABEL = 'What the window shows';

const flag = (on: boolean) => (on ? 'true' : 'false');

export function Stage({
  chapters,
  scenes,
}: {
  chapters: readonly Chapter[];
  scenes: readonly ReactNode[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lockRef = useRef(false);
  const unlockTimer = useRef(0);
  const [active, setActive] = useState(FIRST);
  const [pinned, setPinned] = useState(false);
  const last = chapters.length - 1;
  const steps = chapters.length;

  const metrics = useCallback(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin) return null;
    const stickyTop = Number.parseFloat(getComputedStyle(pin).top) || 0;
    const step = (track.offsetHeight - pin.offsetHeight) / steps;
    if (step <= 0) return null;
    return { stickyTop, step, offset: stickyTop - track.getBoundingClientRect().top };
  }, [steps]);

  useEffect(() => {
    const media = window.matchMedia(PINNED_QUERY);
    let frame = 0;

    const read = () => {
      frame = 0;
      if (!media.matches) {
        setActive(FIRST);
        return;
      }
      if (lockRef.current) return;
      const m = metrics();
      if (!m) return;
      setActive(Math.min(last, Math.max(FIRST, Math.floor(m.offset / m.step))));
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };

    const onMedia = () => {
      setPinned(media.matches);
      schedule();
    };

    setPinned(media.matches);
    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', onMedia);
      if (frame !== 0) cancelAnimationFrame(frame);
      window.clearTimeout(unlockTimer.current);
    };
  }, [last, metrics]);

  const goTo = (index: number) => {
    const reduced = prefersReducedMotion();
    if (!pinned) {
      sceneRefs.current[index]?.scrollIntoView({
        block: 'center',
        behavior: reduced ? 'auto' : 'smooth',
      });
      return;
    }
    if (index === active) return;
    const m = metrics();
    if (!m) return;
    lockRef.current = true;
    setActive(index);
    window.scrollTo({
      top: window.scrollY - m.offset + index * m.step + 1,
      behavior: reduced ? 'auto' : 'smooth',
    });
    window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(
      () => {
        lockRef.current = false;
      },
      reduced ? 0 : SCROLL_LOCK_MS,
    );
  };

  return (
    <div className="f1-stage-track" ref={trackRef}>
      <div className="f1-stage-pin" ref={pinRef}>
        <ol className="f1-rail" role="list" aria-label={RAIL_LABEL}>
          {chapters.map((chapter, index) => (
            <li key={chapter.id} className="f1-rail-row" data-active={flag(active === index)}>
              <h3 className="f1-rail-title">
                <button
                  type="button"
                  className="f1-rail-btn"
                  aria-current={active === index ? 'true' : undefined}
                  onClick={() => goTo(index)}
                >
                  {chapter.title}
                </button>
              </h3>
              <div className="f1-rail-body">
                <p>{chapter.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="f1-scenes">
          {scenes.map((scene, index) => (
            <div
              key={chapters[index]?.id ?? index}
              className="f1-scene"
              data-active={flag(active === index)}
              ref={(node) => {
                sceneRefs.current[index] = node;
              }}
            >
              {scene}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
