import { forwardRef, type ReactNode } from 'react';
import { ICON_GRID } from './grid';
import type { Icon, IconProps } from './types';

function resolveStrokeWidth(
  strokeWidth: NonNullable<IconProps['strokeWidth']>,
  size: NonNullable<IconProps['size']>,
  absolute: boolean | undefined,
): number | string {
  if (!absolute) return strokeWidth;
  return (Number(strokeWidth) * ICON_GRID.size) / Number(size);
}

export function createIcon(iconName: string, glyph: ReactNode): Icon {
  const IconComponent = forwardRef<SVGSVGElement, Omit<IconProps, 'ref'>>(function IconComponent(
    {
      size = ICON_GRID.size,
      strokeWidth = ICON_GRID.strokeWidth,
      absoluteStrokeWidth,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns={ICON_GRID.xmlns}
        width={size}
        height={size}
        viewBox={ICON_GRID.viewBox}
        fill={ICON_GRID.fill}
        stroke={ICON_GRID.stroke}
        strokeWidth={resolveStrokeWidth(strokeWidth, size, absoluteStrokeWidth)}
        strokeLinecap={ICON_GRID.linecap}
        strokeLinejoin={ICON_GRID.linejoin}
        focusable={ICON_GRID.focusable}
        {...rest}
      >
        {glyph}
        {children}
      </svg>
    );
  });

  IconComponent.displayName = iconName;

  return IconComponent;
}
