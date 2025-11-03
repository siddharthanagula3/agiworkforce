export interface RegionEffect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenshotOverlayProps {
  region: RegionEffect | null;
  flash: boolean;
}

function clampSize(value: number): number {
  return Math.max(value, 0);
}

export function ScreenshotOverlay({ region, flash }: ScreenshotOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[998]">
      {flash && (
        <div className="absolute inset-0 bg-white/80" style={{ animation: 'overlay-flash 180ms ease-out forwards' }} />
      )}
      {region && (
        <div
          className="absolute border-2 border-primary/80 bg-primary/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
          style={{
            left: region.x,
            top: region.y,
            width: clampSize(region.width),
            height: clampSize(region.height),
            animation: 'overlay-highlight 1s ease-out forwards',
          }}
        >
          <div className="absolute inset-0 border border-dashed border-primary/60 opacity-70" />
        </div>
      )}
    </div>
  );
}
