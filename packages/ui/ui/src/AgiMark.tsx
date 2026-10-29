// The declaration is a script. A module augmentation cannot introduce `*.png`,
// and consumers that typecheck this file do not include png.d.ts on their own.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./png.d.ts" />
import type { CSSProperties } from 'react';
import symbolAsset from './agi-symbol.png';

interface AgiMarkProps {
  size?: number;
  mono?: boolean;
  spinning?: boolean;
  accent?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

function markSrc(asset: string | { src: string }): string {
  return typeof asset === 'string' ? asset : asset.src;
}

const symbolUrl = markSrc(symbolAsset);

export function AgiMark({
  size = 24,
  spinning = false,
  ariaLabel,
  className,
  style,
}: AgiMarkProps) {
  const classes = ['agi-mark', spinning ? 'agi-mark-spin' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <img
      src={symbolUrl}
      alt={ariaLabel ?? ''}
      width={size}
      height={size}
      draggable={false}
      aria-hidden={ariaLabel ? undefined : true}
      className={classes}
      style={style}
    />
  );
}
