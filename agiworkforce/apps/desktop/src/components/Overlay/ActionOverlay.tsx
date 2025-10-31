import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export interface ClickEffect {
  id: string;
  x: number;
  y: number;
  button: string;
}

export interface TypingEffect {
  id: string;
  x: number;
  y: number;
  text: string;
}

interface ActionOverlayProps {
  clicks: ClickEffect[];
  typing: TypingEffect | null;
}

const BUTTON_COLORS: Record<string, string> = {
  right: 'border-red-400 bg-red-400/30',
  middle: 'border-emerald-400 bg-emerald-400/30',
  left: 'border-primary/80 bg-primary/30',
};

function clampToViewport(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function ClickRipple({ effect }: { effect: ClickEffect }) {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setActivated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;

  const x = clampToViewport(effect.x, width);
  const y = clampToViewport(effect.y, height);

  const colors = BUTTON_COLORS[effect.button] ?? BUTTON_COLORS['left'];

  return (
    <span
      className={cn(
        'pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 backdrop-blur-sm transition-all duration-300 ease-out',
        colors,
        activated ? 'scale-125 opacity-0' : 'scale-75 opacity-90'
      )}
      style={{
        left: x,
        top: y,
        boxShadow: '0 0 25px rgba(59,130,246,0.35)',
      }}
    />
  );
}

function TypingOverlay({ effect }: { effect: TypingEffect }) {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;

  const x = clampToViewport(effect.x, width);
  const y = clampToViewport(effect.y, height);

  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full transform"
      style={{ left: x, top: y }}
    >
      <div className="rounded-md bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-xl ring-1 ring-primary/40 backdrop-blur">
        {effect.text}
      </div>
      <div className="mx-auto mt-1 h-3 w-px animate-[overlay-caret_700ms_step-end_infinite] bg-primary/70" />
    </div>
  );
}

export function ActionOverlay({ clicks, typing }: ActionOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[999]">
      {clicks.map((effect) => (
        <ClickRipple key={effect.id} effect={effect} />
      ))}
      {typing && <TypingOverlay effect={typing} />}
    </div>
  );
}
