'use client';

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const RISE_PX = 12;
const DURATION_S = 0.5;
const EXPO_OUT = [0.22, 1, 0.36, 1] as const;
const IN_VIEW_AMOUNT = 0.15;
const HIDDEN = { opacity: 0, y: RISE_PX } as const;
const VISIBLE = { opacity: 1, y: 0 } as const;

export function MotionReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className={['agi-ds-reveal', className].filter(Boolean).join(' ')}
        initial={reduceMotion ? false : HIDDEN}
        whileInView={VISIBLE}
        viewport={{ once: true, amount: IN_VIEW_AMOUNT }}
        transition={{
          duration: reduceMotion ? 0 : DURATION_S,
          delay: reduceMotion ? 0 : delay,
          ease: EXPO_OUT,
        }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
