'use client';

import { useCallback, useRef, useState, type PointerEvent } from 'react';

const BRUSH_FRACTION = 0.05;

interface Point {
  x: number;
  y: number;
}

export interface RegionSelectorProps {
  imageUrl: string;
  onMaskChange: (mask: File | null) => void;
}

export function RegionSelector({ imageUrl, onMaskChange }: RegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tintRef = useRef<HTMLSpanElement>(null);
  const lastPoint = useRef<Point | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const pointFor = useCallback((event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }, []);

  const paint = useCallback((from: Point, to: Point) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.strokeStyle = tintRef.current ? getComputedStyle(tintRef.current).color : 'black';
    context.lineWidth = Math.max(8, canvas.width * BRUSH_FRACTION);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }, []);

  const exportMask = useCallback(() => {
    const selection = canvasRef.current;
    if (!selection) return;
    const mask = document.createElement('canvas');
    mask.width = selection.width;
    mask.height = selection.height;
    const context = mask.getContext('2d');
    if (!context) {
      onMaskChange(null);
      return;
    }
    context.fillStyle = 'black';
    context.fillRect(0, 0, mask.width, mask.height);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(selection, 0, 0);
    mask.toBlob((blob) => {
      onMaskChange(blob ? new File([blob], 'selection.png', { type: 'image/png' }) : null);
    }, 'image/png');
  }, [onMaskChange]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointFor(event);
      lastPoint.current = point;
      paint(point, point);
    },
    [paint, pointFor],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!lastPoint.current) return;
      const point = pointFor(event);
      paint(lastPoint.current, point);
      lastPoint.current = point;
    },
    [paint, pointFor],
  );

  const handlePointerUp = useCallback(() => {
    if (!lastPoint.current) return;
    lastPoint.current = null;
    exportMask();
  }, [exportMask]);

  return (
    <div className="relative inline-flex max-h-full max-w-full">
      <img
        src={imageUrl}
        alt="Image to select an area on"
        className="max-h-full max-w-full rounded-xl object-contain shadow-lg"
        onLoad={(event) =>
          setSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      {size ? (
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          aria-label="Paint over the area to change"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl opacity-50"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ) : null}
      <span ref={tintRef} className="hidden text-primary" aria-hidden="true" />
    </div>
  );
}
