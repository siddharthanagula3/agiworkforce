'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-7 rounded px-2 text-xs',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  disabled,
  children,
  ref,
  'aria-label': ariaLabel,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const classes = cn(buttonVariants({ variant, size, className }));
  const inert = disabled || isLoading;

  if (asChild) {
    return (
      <Comp
        className={classes}
        ref={ref}
        aria-label={ariaLabel}
        aria-busy={isLoading || undefined}
        aria-disabled={inert || undefined}
        disabled={inert}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  const hasTextContent = React.Children.toArray(children).some(
    (child) => typeof child === 'string' && child.trim() !== '',
  );

  return (
    <Comp
      className={classes}
      ref={ref}
      aria-label={ariaLabel}
      aria-busy={isLoading || undefined}
      aria-disabled={inert || undefined}
      disabled={inert}
      {...props}
    >
      {children}
      {isLoading && <span className="sr-only">Loading, please wait</span>}
      {!hasTextContent && !ariaLabel && <span className="sr-only">Button</span>}
    </Comp>
  );
}
Button.displayName = 'Button';

export { Button, buttonVariants };
