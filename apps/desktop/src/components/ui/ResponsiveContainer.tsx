import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children to render */
  children: React.ReactNode;
  /** Maximum width of the container */
  maxWidth?:
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | '7xl'
    | 'full';
  /** Horizontal padding on mobile */
  mobilePadding?: 'none' | 'sm' | 'md' | 'lg';
  /** Whether to center the container */
  centered?: boolean;
  /** Whether content should scroll when overflowing */
  scrollable?: boolean;
  /** Scroll direction when scrollable is true */
  scrollDirection?: 'vertical' | 'horizontal' | 'both';
  /** Whether to handle safe areas (for mobile notches) */
  safeArea?: boolean;
}

const maxWidthClasses = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

const mobilePaddingClasses = {
  none: '',
  sm: 'px-2 sm:px-4',
  md: 'px-4 sm:px-6',
  lg: 'px-6 sm:px-8',
};

/**
 * A responsive container component for consistent layouts.
 *
 * Features:
 * - Consistent max-width constraints
 * - Mobile-friendly padding
 * - Safe area handling for notched devices
 * - Scroll handling
 * - Touch-friendly targets
 *
 * Usage:
 * ```tsx
 * <ResponsiveContainer maxWidth="4xl" mobilePadding="md" centered>
 *   <YourContent />
 * </ResponsiveContainer>
 * ```
 */
function ResponsiveContainer({
  children,
  maxWidth = '4xl',
  mobilePadding = 'md',
  centered = true,
  scrollable = false,
  scrollDirection = 'vertical',
  safeArea = false,
  className,
  ...props
}: ResponsiveContainerProps) {
  const scrollClasses = {
    vertical: 'overflow-y-auto overflow-x-hidden',
    horizontal: 'overflow-x-auto overflow-y-hidden',
    both: 'overflow-auto',
  };

  return (
    <div
      className={cn(
        'w-full',
        maxWidthClasses[maxWidth],
        mobilePaddingClasses[mobilePadding],
        centered && 'mx-auto',
        scrollable && scrollClasses[scrollDirection],
        safeArea && 'pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

ResponsiveContainer.displayName = 'ResponsiveContainer';

/**
 * A responsive grid component for layout.
 */
export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children to render */
  children: React.ReactNode;
  /** Number of columns at different breakpoints */
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

const gapClasses = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

function ResponsiveGrid({
  children,
  cols = { default: 1, sm: 2, lg: 3 },
  gap = 'md',
  className,
  ...props
}: ResponsiveGridProps) {
  const colClasses = [
    cols.default && `grid-cols-${cols.default}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('grid', gapClasses[gap], colClasses, className)} {...props}>
      {children}
    </div>
  );
}

ResponsiveGrid.displayName = 'ResponsiveGrid';

/**
 * A component for responsive visibility based on breakpoints.
 */
export interface ResponsiveShowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children to render */
  children: React.ReactNode;
  /** Show above this breakpoint */
  above?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Show below this breakpoint */
  below?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

function ResponsiveShow({ children, above, below, className, ...props }: ResponsiveShowProps) {
  const showAboveClasses = {
    sm: 'hidden sm:block',
    md: 'hidden md:block',
    lg: 'hidden lg:block',
    xl: 'hidden xl:block',
    '2xl': 'hidden 2xl:block',
  };

  const showBelowClasses = {
    sm: 'sm:hidden',
    md: 'md:hidden',
    lg: 'lg:hidden',
    xl: 'xl:hidden',
    '2xl': '2xl:hidden',
  };

  return (
    <div
      className={cn(above && showAboveClasses[above], below && showBelowClasses[below], className)}
      {...props}
    >
      {children}
    </div>
  );
}

ResponsiveShow.displayName = 'ResponsiveShow';

/**
 * A touch-friendly target wrapper that ensures minimum touch target size.
 */
export interface TouchTargetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Children to wrap */
  children: React.ReactNode;
  /** Minimum size (44px is the recommended minimum) */
  minSize?: 'sm' | 'md' | 'lg';
}

const touchSizeClasses = {
  sm: 'min-h-[36px] min-w-[36px]',
  md: 'min-h-[44px] min-w-[44px]',
  lg: 'min-h-[48px] min-w-[48px]',
};

function TouchTarget({ children, minSize = 'md', className, ...props }: TouchTargetProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center',
        touchSizeClasses[minSize],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

TouchTarget.displayName = 'TouchTarget';

/**
 * Hook to detect current breakpoint
 */
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = React.useState<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'>(
    'xs',
  );

  React.useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      if (width >= 1536) {
        setBreakpoint('2xl');
      } else if (width >= 1280) {
        setBreakpoint('xl');
      } else if (width >= 1024) {
        setBreakpoint('lg');
      } else if (width >= 768) {
        setBreakpoint('md');
      } else if (width >= 640) {
        setBreakpoint('sm');
      } else {
        setBreakpoint('xs');
      }
    };

    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, []);

  return breakpoint;
}

/**
 * Hook to detect if the device supports touch
 */
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(false);

  React.useEffect(() => {
    setIsTouch(
      'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        ((navigator as unknown as { msMaxTouchPoints?: number }).msMaxTouchPoints !== undefined &&
          (navigator as unknown as { msMaxTouchPoints?: number }).msMaxTouchPoints! > 0),
    );
  }, []);

  return isTouch;
}

export { ResponsiveContainer, ResponsiveGrid, ResponsiveShow, TouchTarget };
