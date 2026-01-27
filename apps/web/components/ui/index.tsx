import * as React from 'react';
import { cn } from '../../utils/cn';

// React 19: ref is now a regular prop - forwardRef is deprecated
// https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-white text-black hover:bg-zinc-200',
        variant === 'outline' &&
          'border border-zinc-800 bg-transparent hover:bg-zinc-900 text-white',
        variant === 'ghost' && 'hover:bg-zinc-900 text-zinc-400 hover:text-white',
        size === 'sm' && 'h-9 px-3 text-xs',
        size === 'md' && 'h-10 px-4 py-2',
        size === 'lg' && 'h-12 px-8 text-lg',
        className,
      )}
      {...props}
    />
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, type, ref, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-white ring-offset-black file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export * from './card';
