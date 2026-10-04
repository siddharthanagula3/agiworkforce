'use client';

import { useEffect, useRef, useState } from 'react';

interface DirectoryCardIconProps {
  readonly src: string;
  readonly monogram: string;
}

export function DirectoryCardIcon({ src, monogram }: DirectoryCardIconProps) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground"
      >
        {monogram}
      </span>
    );
  }

  return (
    <img
      ref={imageRef}
      src={src}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 rounded-md"
      onError={() => setFailed(true)}
    />
  );
}
