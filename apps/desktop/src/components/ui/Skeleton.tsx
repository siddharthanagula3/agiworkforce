import { cn } from '../../lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Base skeleton component for loading states.
 */
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

/**
 * Skeleton for text content - displays multiple lines.
 */
interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of lines to display */
  lines?: number;
  /** Whether the last line should be shorter */
  lastLineWidth?: 'full' | 'three-quarters' | 'half';
  /** Gap between lines */
  gap?: 'sm' | 'md' | 'lg';
  /** Animation style */
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
      aria-label="Loading content"
      {...props}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          animation={animation}
          className={cn('h-4', index === lines - 1 ? lastLineWidthClass[lastLineWidth] : 'w-full')}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

SkeletonText.displayName = 'SkeletonText';

/**
 * Skeleton for a card component.
 */
interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show an image placeholder */
  showImage?: boolean;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Number of text lines */
  textLines?: number;
  /** Animation style */
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
  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-4', className)}
      role="status"
      aria-label="Loading card"
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
      <span className="sr-only">Loading...</span>
    </div>
  );
}

SkeletonCard.displayName = 'SkeletonCard';

/**
 * Skeleton for a list item with avatar.
 */
interface SkeletonListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show an avatar */
  showAvatar?: boolean;
  /** Avatar shape */
  avatarShape?: 'circle' | 'square';
  /** Number of text lines */
  textLines?: number;
  /** Animation style */
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
  return (
    <div
      className={cn('flex items-start gap-3', className)}
      role="status"
      aria-label="Loading item"
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
      <span className="sr-only">Loading...</span>
    </div>
  );
}

SkeletonListItem.displayName = 'SkeletonListItem';

/**
 * Skeleton for a chat message.
 */
interface SkeletonChatMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether this is a user message (right-aligned) */
  isUser?: boolean;
  /** Number of text lines */
  lines?: number;
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonChatMessage({
  isUser = false,
  lines = 2,
  animation = 'pulse',
  className,
  ...props
}: SkeletonChatMessageProps) {
  return (
    <div
      className={cn('flex gap-3', isUser && 'flex-row-reverse', className)}
      role="status"
      aria-label="Loading message"
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
      <span className="sr-only">Loading...</span>
    </div>
  );
}

SkeletonChatMessage.displayName = 'SkeletonChatMessage';

/**
 * Skeleton for a table row.
 */
interface SkeletonTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Number of columns */
  columns?: number;
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonTableRow({
  columns = 4,
  animation = 'pulse',
  className,
  ...props
}: SkeletonTableRowProps) {
  return (
    <tr className={className} role="status" aria-label="Loading row" {...props}>
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
      <td className="sr-only">Loading...</td>
    </tr>
  );
}

SkeletonTableRow.displayName = 'SkeletonTableRow';

/**
 * Skeleton for form fields.
 */
interface SkeletonFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show a label */
  showLabel?: boolean;
  /** Whether to show helper text */
  showHelper?: boolean;
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonFormField({
  showLabel = true,
  showHelper = false,
  animation = 'pulse',
  className,
  ...props
}: SkeletonFormFieldProps) {
  return (
    <div
      className={cn('space-y-2', className)}
      role="status"
      aria-label="Loading form field"
      {...props}
    >
      {showLabel && <Skeleton animation={animation} className="h-4 w-24" />}
      <Skeleton animation={animation} className="h-10 w-full" />
      {showHelper && <Skeleton animation={animation} className="h-3 w-48" />}
      <span className="sr-only">Loading...</span>
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
