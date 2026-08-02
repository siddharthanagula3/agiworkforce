import { motion, type HTMLMotionProps } from 'framer-motion';
import { Globe, KeyRound, Layers, Lock, Sparkles } from 'lucide-react';
import { AgiMark } from '@agiworkforce/ui';
import { NativeSignInCard } from './NativeSignInCard';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

const trustPoints = [
  {
    icon: Lock,
    label: 'Local stays local',
    description: 'Local mode never leaves your device — no account required.',
  },
  {
    icon: KeyRound,
    label: 'BYOK on Desktop + CLI',
    description: 'Your provider keys are user-controlled and never stored by AGI Cloud.',
  },
  {
    icon: Sparkles,
    label: 'Cloud on every surface',
    description:
      'AGI Cloud is in public alpha — sign in to sync your chats across desktop, web, and mobile.',
  },
];

type MotionVariant = Partial<Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'transition'>>;

/** Framer Motion variants — collapse to no-op when reduced-motion is preferred */
function useMotionVariants(): { fadeUp: MotionVariant } {
  const reduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  if (reduced) {
    return { fadeUp: {} };
  }
  return {
    fadeUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    },
  };
}

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const { fadeUp } = useMotionVariants();

  /* ------------------------------------------------------------------ */
  /* Main auth layout: split left aside + right form                     */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-full min-h-full bg-background">
      {/* ---- Left marketing aside (hidden on small screens) ---- */}
      <aside
        className="hidden w-[42%] min-w-[360px] flex-col justify-between border-r border-border bg-muted/20 px-12 py-10 lg:flex"
        aria-label="AGI Cloud overview"
      >
        {/* Brand mark */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background"
            aria-hidden="true"
          >
            <AgiMark size={20} mono />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">AGI</span>
        </motion.div>

        {/* Headline + sub-copy */}
        <motion.div {...fadeUp} transition={{ delay: 0.25, duration: 0.4 }} className="-mt-6">
          <h1 className="mb-3 max-w-xs text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
            Beyond one model.
            <br />
            Beyond one surface.
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            AGI brings 10+ AI providers into a single workspace — desktop, mobile, web, CLI,
            VS&nbsp;Code, and Chrome. Your context, everywhere.
          </p>
        </motion.div>

        {/* Trust-mode points */}
        <motion.ul
          {...fadeUp}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="space-y-4"
          aria-label="How AGI keeps your data safe"
        >
          {trustPoints.map((point, i) => (
            <motion.li
              key={point.label}
              {...fadeUp}
              transition={{ delay: 0.45 + i * 0.08, duration: 0.3 }}
              className="flex items-start gap-3"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                aria-hidden="true"
              >
                <point.icon className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{point.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </motion.li>
          ))}
        </motion.ul>

        {/* Six-surface footer line */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="flex items-center gap-2 border-t border-border pt-6"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" aria-hidden="true" />
            </span>{' '}
            Available on Desktop · Mobile · Web · CLI · VS&nbsp;Code · Chrome
          </p>
        </motion.div>
      </aside>

      {/* ---- Right form column ---- */}
      <main className="relative flex flex-1 items-center justify-center p-8">
        {/* Mobile-only brand mark */}
        <div className="absolute left-6 top-6 lg:hidden" aria-hidden="true">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <AgiMark size={18} mono />
            </div>
            <span className="font-semibold text-foreground">AGI</span>
          </div>
        </div>

        <NativeSignInCard onSuccess={onAuthSuccess} />
      </main>
    </div>
  );
}

export default AuthPage;
