'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { TURN } from './content';
import {
  Answer,
  Composer,
  ICON_SIZE,
  ICON_STROKE,
  Prompt,
  Receipt,
  ToolRow,
  Window,
  type WindowSize,
} from './Window';

const WINDOW_LABEL = 'AGI Web answering a question about a contract and printing its receipt';
const REPLAY_LABEL = 'Replay the answer';
const VISIBLE_THRESHOLD = 0.1;

const flag = (on: boolean) => (on ? 'true' : 'false');

export function ChatTurn({
  animate = false,
  size = 'stage',
}: {
  animate?: boolean;
  size?: WindowSize;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [playKey, setPlayKey] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!animate) return;
    const node = ref.current;
    if (!node) return;
    let tabVisible = document.visibilityState === 'visible';
    let onScreen = true;
    const update = () => setPaused(!tabVisible || !onScreen);
    const onVisibility = () => {
      tabVisible = document.visibilityState === 'visible';
      update();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        update();
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [animate]);

  const replay = animate ? (
    <button
      type="button"
      className="f1-win-replay"
      aria-label={REPLAY_LABEL}
      onClick={() => setPlayKey((key) => key + 1)}
    >
      <RotateCcw size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
    </button>
  ) : undefined;

  return (
    <div
      ref={ref}
      key={playKey}
      className="f1-turn"
      data-animate={flag(animate)}
      data-paused={flag(paused)}
    >
      <Window
        url={TURN.url}
        label={WINDOW_LABEL}
        size={size}
        recent="Contract summary"
        bar={replay}
      >
        <div className="f1-thread">
          <Prompt file={TURN.file}>{TURN.prompt}</Prompt>
          <ToolRow>{TURN.activity}</ToolRow>
          <Answer sections={TURN.answer} />
          <Receipt segments={TURN.receipt} />
        </div>
        <Composer placeholder={TURN.placeholder} picker={TURN.picker} />
      </Window>
    </div>
  );
}
