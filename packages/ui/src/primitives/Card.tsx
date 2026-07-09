'use client';

import * as React from 'react';
import { cn } from '../cn';

// React 19 ref-as-prop pattern - no forwardRef needed

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Semantic element to render. Use `'article'` for standalone content or
   * `'section'` for a significant region; defaults to a layout `'div'`.
   * Additive — existing callers keep the `<div>`. Accessible naming
   * (`aria-label` / `aria-labelledby`) flows through via spread props.
   */
  as?: 'article' | 'section' | 'div';
  ref?: React.Ref<HTMLDivElement>;
}

function Card({ className, as: Component = 'div', ref, ...props }: CardProps) {
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    />
  );
}
Card.displayName = 'Card';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function CardHeader({ className, ref, ...props }: CardHeaderProps) {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}
CardHeader.displayName = 'CardHeader';

// NOTE: ref type is `React.Ref<HTMLHeadingElement>` (matching the rendered <h3> and
// the HTMLAttributes<HTMLHeadingElement> extends clause below). Desktop's copy of this
// file had drifted to `React.Ref<HTMLParagraphElement>` (an apparent copy/paste from
// CardDescriptionProps) — web's version is correct and is the canonical source here.
interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * Heading level to render for a correct document outline. Defaults to `h3`.
   * Additive — existing callers keep the `<h3>`.
   */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  ref?: React.Ref<HTMLHeadingElement>;
}

function CardTitle({ className, as: Component = 'h3', ref, ...props }: CardTitleProps) {
  return (
    <Component
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}
CardTitle.displayName = 'CardTitle';

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  ref?: React.Ref<HTMLParagraphElement>;
}

function CardDescription({ className, ref, ...props }: CardDescriptionProps) {
  return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
CardDescription.displayName = 'CardDescription';

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function CardContent({ className, ref, ...props }: CardContentProps) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
}
CardContent.displayName = 'CardContent';

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function CardFooter({ className, ref, ...props }: CardFooterProps) {
  return <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
