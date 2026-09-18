'use client';

import { useEffect, useState } from 'react';

const COUNTDOWN_TICK_MS = 1000;

export function useCountdown(initialSeconds: number): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((current) => current - 1), COUNTDOWN_TICK_MS);
    return () => clearTimeout(timer);
  }, [remaining]);

  return [remaining, setRemaining];
}
