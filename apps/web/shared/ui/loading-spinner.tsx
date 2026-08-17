import * as React from 'react';
import { Spinner } from '@agiworkforce/ui';

const primitiveSize = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const;

export interface LoadingSpinnerProps extends Omit<
  React.ComponentPropsWithoutRef<typeof Spinner>,
  'size'
> {
  size?: keyof typeof primitiveSize;
}

const LoadingSpinner = ({ size = 'md', ...props }: LoadingSpinnerProps) => (
  <Spinner aria-label="Loading" size={primitiveSize[size]} {...props} />
);

export default LoadingSpinner;
