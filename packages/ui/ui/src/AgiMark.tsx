// The declaration is a script. A module augmentation cannot introduce `*.png`,
// and consumers that typecheck this file do not include png.d.ts on their own.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./png.d.ts" />
import type { CSSProperties, ImgHTMLAttributes } from 'react';
import symbolAsset from './agi-symbol.png';

interface AgiMarkProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'width' | 'height'
> {
  size?: number;
  mono?: boolean;
  spinning?: boolean;
  animationPaused?: boolean;
  accent?: string;
  ariaLabel?: string;
}

function markSrc(asset: string | { src: string }): string {
  return typeof asset === 'string' ? asset : asset.src;
}

const symbolUrl = markSrc(symbolAsset);

export function AgiMark({
  size = 24,
  spinning = false,
  animationPaused = false,
  mono: _mono,
  accent: _accent,
  ariaLabel,
  className,
  style,
  alt,
  ...imageProps
}: AgiMarkProps) {
  const label = ariaLabel ?? imageProps['aria-label'] ?? alt;
  const classes = ['agi-mark', spinning ? 'agi-mark-spin' : '', className]
    .filter(Boolean)
    .join(' ');

  const mark = (
    <img
      {...imageProps}
      src={symbolUrl}
      alt={label ?? ''}
      width={size}
      height={size}
      draggable={false}
      aria-hidden={imageProps['aria-hidden'] ?? (label ? undefined : true)}
      className={classes}
      style={style}
    />
  );

  if (!spinning) return mark;

  return (
    <span
      className="agi-mark-motion"
      data-paused={animationPaused || undefined}
      style={
        {
          width: style?.width,
          height: style?.height,
          '--agi-mark-symbol': `url("${symbolUrl}")`,
        } as CSSProperties
      }
    >
      {mark}
      <svg className="agi-mark-ribbon" viewBox="0 0 100 100" aria-hidden="true">
        <path className="agi-mark-shine" />
      </svg>
    </span>
  );
}
