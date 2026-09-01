import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';

type SvgAttributes = Partial<SVGProps<SVGSVGElement>>;

type ElementAttributes = RefAttributes<SVGSVGElement> & SvgAttributes;

export interface IconProps extends ElementAttributes {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

export type Icon = ForwardRefExoticComponent<Omit<IconProps, 'ref'> & RefAttributes<SVGSVGElement>>;
