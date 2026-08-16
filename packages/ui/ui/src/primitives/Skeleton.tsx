'use client';

import * as React from 'react';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  animation?: 'pulse' | 'wave' | 'none';
}

function Skeleton({ className, animation = 'pulse', ...props }: SkeletonProps) {
  const animationClass = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%]',
    none: '',
  };

  return (
    <div
      className={cn('rounded-md bg-muted', animationClass[animation], className)}
      aria-hidden="true"
      {...props}
    />
  );
}

Skeleton.displayName = 'Skeleton';

interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lastLineWidth?: 'full' | 'three-quarters' | 'half';
  gap?: 'sm' | 'md' | 'lg';
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonText({
  lines = 3,
  lastLineWidth = 'three-quarters',
  gap = 'md',
  animation = 'pulse',
  className,
  ...props
}: SkeletonTextProps) {
  const { t } = useUiTranslation('common');
  const gapClass = {
    sm: 'space-y-1',
    md: 'space-y-2',
    lg: 'space-y-3',
  };

  const lastLineWidthClass = {
    full: 'w-full',
    'three-quarters': 'w-3/4',
    half: 'w-1/2',
  };

  return (
    <div
      className={cn(gapClass[gap], className)}
      role="status"
      aria-label={t('loadingContent', 'Loading content')}
      {...props}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          animation={animation}
          className={cn('h-4', index === lines - 1 ? lastLineWidthClass[lastLineWidth] : 'w-full')}
        />
      ))}
      <span className="sr-only">{t('loading', 'Loading...')}</span>
    </div>
  );
}

SkeletonText.displayName = 'SkeletonText';

interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  showImage?: boolean;
  showActions?: boolean;
  textLines?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonCard({
  showImage = true,
  showActions = false,
  textLines = 2,
  animation = 'pulse',
  className,
  ...props
}: SkeletonCardProps) {
  const { t } = useUiTranslation('common');

  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-4', className)}
      role="status"
      aria-label={t('loadingCard', 'Loading card')}
      {...props}
    >
      {showImage && <Skeleton animation={animation} className="mb-4 h-40 w-full rounded-md" />}
      <div className="space-y-3">
        <Skeleton animation={animation} className="h-5 w-3/4" />
        <SkeletonText lines={textLines} animation={animation} />
        {showActions && (
          <div className="flex gap-2 pt-2">
            <Skeleton animation={animation} className="h-9 w-20" />
            <Skeleton animation={animation} className="h-9 w-20" />
          </div>
        )}
      </div>
      <span className="sr-only">{t('loading', 'Loading...')}</span>
    </div>
  );
}

SkeletonCard.displayName = 'SkeletonCard';

interface SkeletonListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  showAvatar?: boolean;
  avatarShape?: 'circle' | 'square';
  textLines?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonListItem({
  showAvatar = true,
  avatarShape = 'circle',
  textLines = 2,
  animation = 'pulse',
  className,
  ...props
}: SkeletonListItemProps) {
  const { t } = useUiTranslation('common');

  return (
    <div
      className={cn('flex items-start gap-3', className)}
      role="status"
      aria-label={t('loadingItem', 'Loading item')}
      {...props}
    >
      {showAvatar && (
        <Skeleton
          animation={animation}
          className={cn(
            'h-10 w-10 shrink-0',
            avatarShape === 'circle' ? 'rounded-full' : 'rounded-md',
          )}
        />
      )}
      <div className="flex-1 space-y-2">
        <Skeleton animation={animation} className="h-4 w-1/3" />
        {textLines > 1 && <SkeletonText lines={textLines - 1} animation={animation} gap="sm" />}
      </div>
      <span className="sr-only">{t('loading', 'Loading...')}</span>
    </div>
  );
}

SkeletonListItem.displayName = 'SkeletonListItem';

interface SkeletonChatMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  isUser?: boolean;
  lines?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonChatMessage({
  isUser = false,
  lines = 2,
  animation = 'pulse',
  className,
  ...props
}: SkeletonChatMessageProps) {
  const { t } = useUiTranslation('common');

  return (
    <div
      className={cn('flex gap-3', isUser && 'flex-row-reverse', className)}
      role="status"
      aria-label={t('loadingMessage', 'Loading message')}
      {...props}
    >
      <Skeleton animation={animation} className="h-8 w-8 shrink-0 rounded-full" />
      <div className={cn('max-w-[70%] space-y-2', isUser && 'items-end')}>
        <Skeleton
          animation={animation}
          className={cn('rounded-2xl p-4', isUser ? 'rounded-br-sm' : 'rounded-bl-sm')}
          style={{ width: '100%', minWidth: '200px', height: `${lines * 20 + 32}px` }}
        />
      </div>
      <span className="sr-only">{t('loading', 'Loading...')}</span>
    </div>
  );
}

SkeletonChatMessage.displayName = 'SkeletonChatMessage';

interface SkeletonTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  columns?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonTableRow({
  columns = 4,
  animation = 'pulse',
  className,
  ...props
}: SkeletonTableRowProps) {
  const { t } = useUiTranslation('common');

  return (
    <tr className={className} role="status" aria-label={t('loadingRow', 'Loading row')} {...props}>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="p-3">
          <Skeleton
            animation={animation}
            className={cn(
              'h-4',
              index === 0 ? 'w-3/4' : index === columns - 1 ? 'w-1/2' : 'w-full',
            )}
          />
        </td>
      ))}
      <td className="sr-only">{t('loading', 'Loading...')}</td>
    </tr>
  );
}

SkeletonTableRow.displayName = 'SkeletonTableRow';

interface SkeletonFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  showLabel?: boolean;
  showHelper?: boolean;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonFormField({
  showLabel = true,
  showHelper = false,
  animation = 'pulse',
  className,
  ...props
}: SkeletonFormFieldProps) {
  const { t } = useUiTranslation('common');

  return (
    <div
      className={cn('space-y-2', className)}
      role="status"
      aria-label={t('loadingFormField', 'Loading form field')}
      {...props}
    >
      {showLabel && <Skeleton animation={animation} className="h-4 w-24" />}
      <Skeleton animation={animation} className="h-10 w-full" />
      {showHelper && <Skeleton animation={animation} className="h-3 w-48" />}
      <span className="sr-only">{t('loading', 'Loading...')}</span>
    </div>
  );
}

SkeletonFormField.displayName = 'SkeletonFormField';

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
  SkeletonChatMessage,
  SkeletonTableRow,
  SkeletonFormField,
};
