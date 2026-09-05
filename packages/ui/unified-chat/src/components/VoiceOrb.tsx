import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import {
  ORB_FOCUS_SCALE,
  ORB_GROW_IN_MS,
  ORB_SEED_SIZE,
  ORB_STATE,
  type OrbState,
} from '../voice/voice-session-machine';

const LABEL = {
  focus: 'Hide the transcript and focus the orb',
  unfocus: 'Show the transcript again',
} as const;

const ORB_TOKEN = {
  core: '--chat-voice-orb-core',
  rim: '--chat-voice-orb-rim',
  band: '--chat-voice-orb-band',
  halo: '--chat-voice-orb-halo',
} as const;

const BREATH_PERIOD_MS = 5_200;
const BREATH_AMPLITUDE = 0.035;
const BAND_PERIOD_MS = 11_000;
const BAND_RADIUS_RATIO = 0.85;
const BAND_ORBIT_RATIO = 0.45;
const CORE_OFFSET_RATIO = 0.32;
const CORE_INNER_RATIO = 0.08;
const HALO_RATIO = 1.55;
const MUTED_OPACITY = 0.45;
const FULL_TURN = Math.PI * 2;
const HALF = 0.5;

export const DEFAULT_ORB_CANVAS_SIZE = 204;
export const DEFAULT_ORB_SPHERE_SIZE = 80;

interface OrbColours {
  core: string;
  rim: string;
  band: string;
  halo: string;
}

function readOrbColours(element: HTMLElement): OrbColours {
  const styles = window.getComputedStyle(element);
  return {
    core: styles.getPropertyValue(ORB_TOKEN.core).trim(),
    rim: styles.getPropertyValue(ORB_TOKEN.rim).trim(),
    band: styles.getPropertyValue(ORB_TOKEN.band).trim(),
    halo: styles.getPropertyValue(ORB_TOKEN.halo).trim(),
  };
}

function paintOrb(
  context: CanvasRenderingContext2D,
  colours: OrbColours,
  canvasSize: number,
  diameter: number,
  phase: number,
): void {
  const centre = canvasSize * HALF;
  const radius = diameter * HALF;
  context.clearRect(0, 0, canvasSize, canvasSize);
  if (radius <= 0) return;

  // Clamped to the canvas: at the focused diameter the unclamped halo runs
  // past the canvas edge and the gradient's transparent stop lands outside
  // the bitmap, which paints the halo as a visible square.
  const haloRadius = Math.min(radius * HALO_RATIO, centre);
  const halo = context.createRadialGradient(centre, centre, radius, centre, centre, haloRadius);
  halo.addColorStop(0, colours.halo);
  halo.addColorStop(1, 'transparent');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centre, centre, haloRadius, 0, FULL_TURN);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(centre, centre, radius, 0, FULL_TURN);
  context.clip();

  const coreX = centre - radius * CORE_OFFSET_RATIO;
  const coreY = centre - radius * CORE_OFFSET_RATIO;
  const sphere = context.createRadialGradient(
    coreX,
    coreY,
    radius * CORE_INNER_RATIO,
    centre,
    centre,
    radius,
  );
  sphere.addColorStop(0, colours.core);
  sphere.addColorStop(1, colours.rim);
  context.fillStyle = sphere;
  context.fillRect(centre - radius, centre - radius, diameter, diameter);

  const bandAngle = (phase / BAND_PERIOD_MS) * FULL_TURN;
  const bandX = centre + Math.cos(bandAngle) * radius * BAND_ORBIT_RATIO;
  const bandY = centre + Math.sin(bandAngle) * radius * BAND_ORBIT_RATIO;
  const band = context.createRadialGradient(
    bandX,
    bandY,
    0,
    bandX,
    bandY,
    radius * BAND_RADIUS_RATIO,
  );
  band.addColorStop(0, colours.band);
  band.addColorStop(1, 'transparent');
  context.fillStyle = band;
  context.fillRect(centre - radius, centre - radius, diameter, diameter);

  context.restore();
}

export interface VoiceOrbCanvasProps {
  orbState: OrbState;
  focus: boolean;
  growIn: boolean;
  reducedMotion: boolean;
  canvasSize?: number;
  sphereSize?: number;
  className?: string;
}

/**
 * The orb's painting alone, with no interactive chrome. A host that already
 * owns the surrounding control (a composer's own mic button, say) mounts this
 * instead of `VoiceOrb` so it never nests a button inside its own.
 */
export function VoiceOrbCanvas({
  orbState,
  focus,
  growIn,
  reducedMotion,
  canvasSize = DEFAULT_ORB_CANVAS_SIZE,
  sphereSize = DEFAULT_ORB_SPHERE_SIZE,
  className,
}: VoiceOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bornAtRef = useRef<number | null>(null);
  const [colours, setColours] = useState<OrbColours | null>(null);
  const restingDiameter = sphereSize * (focus ? ORB_FOCUS_SCALE : 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const sync = () => setColours(readOrbColours(canvas));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colours) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvasSize * ratio;
    canvas.height = canvasSize * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (reducedMotion) {
      paintOrb(context, colours, canvasSize, restingDiameter, 0);
      return undefined;
    }

    if (bornAtRef.current === null) bornAtRef.current = performance.now();
    const bornAt = bornAtRef.current;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - bornAt;
      const grown = growIn ? Math.min(elapsed / ORB_GROW_IN_MS, 1) : 1;
      const seeded = ORB_SEED_SIZE + (restingDiameter - ORB_SEED_SIZE) * grown;
      const breath = 1 + BREATH_AMPLITUDE * Math.sin((elapsed / BREATH_PERIOD_MS) * FULL_TURN);
      paintOrb(context, colours, canvasSize, seeded * breath, elapsed);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [colours, growIn, reducedMotion, restingDiameter, canvasSize]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      data-testid="voice-orb-canvas"
      data-orb-state={orbState}
      style={{
        width: canvasSize,
        height: canvasSize,
        opacity: orbState === ORB_STATE.muted ? MUTED_OPACITY : 1,
      }}
      className={cn('transition-opacity', className)}
      aria-hidden="true"
    />
  );
}

export interface VoiceOrbProps {
  orbState: OrbState;
  label: string;
  focus: boolean;
  growIn: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  className?: string;
  canvasSize?: number;
  sphereSize?: number;
  showLabel?: boolean;
}

export function VoiceOrb({
  orbState,
  label,
  focus,
  growIn,
  reducedMotion,
  onClick,
  className,
  canvasSize = DEFAULT_ORB_CANVAS_SIZE,
  sphereSize = DEFAULT_ORB_SPHERE_SIZE,
  showLabel = true,
}: VoiceOrbProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <button
        type="button"
        onClick={onClick}
        data-testid="voice-orb"
        data-orb-state={orbState}
        aria-pressed={focus}
        aria-label={focus ? LABEL.unfocus : LABEL.focus}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
      >
        <VoiceOrbCanvas
          orbState={orbState}
          focus={focus}
          growIn={growIn}
          reducedMotion={reducedMotion}
          canvasSize={canvasSize}
          sphereSize={sphereSize}
        />
      </button>
      {showLabel && label && (
        <p
          data-testid="voice-orb-state"
          role="status"
          aria-live="polite"
          className="text-sm font-medium text-[var(--chat-text-secondary)]"
        >
          {label}
        </p>
      )}
    </div>
  );
}
