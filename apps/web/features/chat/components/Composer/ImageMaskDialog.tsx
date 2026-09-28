'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@agiworkforce/ui';

import { RegionSelector } from '../RegionSelector';

export interface ImageMaskResult {
  mask: File;
  source: File | null;
}

export interface ImageMaskDialogProps {
  file: File | null;
  onClose: () => void;
  onDone: (result: ImageMaskResult) => void;
}

const PREPARE_FAILED = 'The image could not be prepared for a masked edit. Try another image.';

async function uprightSource(file: File, width: number, height: number): Promise<File | null> {
  const raw = await createImageBitmap(file, { imageOrientation: 'none' });
  const matches = raw.width === width && raw.height === height;
  raw.close();
  if (matches) return null;
  const upright = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = upright.width;
  canvas.height = upright.height;
  canvas.getContext('2d')?.drawImage(upright, 0, 0);
  upright.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(PREPARE_FAILED);
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' });
}

export function ImageMaskDialog({ file, onClose, onDone }: ImageMaskDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mask, setMask] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMask(null);
    setError(null);
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleDone = async () => {
    if (!file || !mask) return;
    setPreparing(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(mask);
      const { width, height } = bitmap;
      bitmap.close();
      onDone({ mask, source: await uprightSource(file, width, height) });
    } catch {
      setError(PREPARE_FAILED);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select the area to change</DialogTitle>
          <DialogDescription>
            Paint over the part of the image to redraw, then describe the change in the message.
            Everything you leave unpainted stays as it is.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-3">
          {imageUrl ? <RegionSelector imageUrl={imageUrl} onMaskChange={setMask} /> : null}
        </div>
        {error ? (
          <p className="text-sm text-destructive-text" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleDone()} disabled={!mask || preparing}>
            {preparing ? <Spinner size="sm" aria-label="Preparing the selection" /> : null}
            Use this area
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
