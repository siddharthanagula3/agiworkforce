import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Region } from '../../types/capture';
import { X, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface RegionSelectorProps {
  onConfirm: (region: Region) => void;
  onCancel: () => void;
}

export function RegionSelector({ onConfirm, onCancel }: RegionSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const region = useMemo(() => {
    if (!startPos || !currentPos) {
      return null;
    }
    return {
      x: Math.min(startPos.x, currentPos.x),
      y: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
    };
  }, [startPos, currentPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsSelecting(true);
    const rect = overlayRef.current?.getBoundingClientRect();
    if (rect) {
      setStartPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setCurrentPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting || !startPos) return;

      const rect = overlayRef.current?.getBoundingClientRect();
      if (rect) {
        setCurrentPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    },
    [isSelecting, startPos]
  );

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (region && region.width > 0 && region.height > 0) {
      onConfirm(region);
    }
  }, [region, onConfirm]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && region) {
        handleConfirm();
      }
    },
    [onCancel, handleConfirm, region]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 cursor-crosshair bg-black/50"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Selection rectangle */}
      {region && (
        <div
          className="absolute border-2 border-primary bg-primary/10"
          style={{
            left: `${region.x}px`,
            top: `${region.y}px`,
            width: `${region.width}px`,
            height: `${region.height}px`,
          }}
        >
          {/* Dimension display */}
          <div className="absolute -top-8 left-0 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
            {region.width} x {region.height}
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 transform">
        <div className="flex gap-2 rounded-lg bg-background p-2 shadow-lg">
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Cancel (Esc)
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!region || region.width === 0 || region.height === 0}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Capture (Enter)
          </Button>
        </div>
      </div>

      {/* Instructions */}
      {!region && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 transform">
          <div className="rounded-lg bg-background px-4 py-2 text-sm shadow-lg">
            Click and drag to select a region
          </div>
        </div>
      )}
    </div>
  );
}
