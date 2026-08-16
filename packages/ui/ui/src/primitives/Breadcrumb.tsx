'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '../cn';

interface BreadcrumbProps extends React.ComponentPropsWithoutRef<'nav'> {
  separator?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

function Breadcrumb({ ref, ...props }: BreadcrumbProps) {
  return <nav ref={ref} aria-label="breadcrumb" {...props} />;
}
Breadcrumb.displayName = 'Breadcrumb';

interface BreadcrumbListProps extends React.ComponentPropsWithoutRef<'ol'> {
  ref?: React.Ref<HTMLOListElement>;
}

function BreadcrumbList({ className, ref, ...props }: BreadcrumbListProps) {
  return (
    <ol
      ref={ref}
      className={cn(
        'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
        className,
      )}
      {...props}
    />
  );
}
BreadcrumbList.displayName = 'BreadcrumbList';

interface BreadcrumbItemProps extends React.ComponentPropsWithoutRef<'li'> {
  ref?: React.Ref<HTMLLIElement>;
}

function BreadcrumbItem({ className, ref, ...props }: BreadcrumbItemProps) {
  return <li ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}
BreadcrumbItem.displayName = 'BreadcrumbItem';

interface BreadcrumbLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  asChild?: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}

function BreadcrumbLink({ asChild, className, ref, ...props }: BreadcrumbLinkProps) {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      ref={ref}
      className={cn('transition-colors hover:text-foreground', className)}
      {...props}
    />
  );
}
BreadcrumbLink.displayName = 'BreadcrumbLink';

interface BreadcrumbPageProps extends React.ComponentPropsWithoutRef<'span'> {
  ref?: React.Ref<HTMLSpanElement>;
}

function BreadcrumbPage({ className, ref, ...props }: BreadcrumbPageProps) {
  return (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-normal text-foreground', className)}
      {...props}
    />
  );
}
BreadcrumbPage.displayName = 'BreadcrumbPage';

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More</span>
    </span>
  );
}
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
