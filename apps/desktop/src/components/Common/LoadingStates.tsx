// Re-export from ui components
export { Spinner, spinnerVariants, type SpinnerProps } from '../ui/Spinner';
export { Skeleton } from '../ui/Skeleton';

// Additional loading state components
import { Spinner } from '../ui/Spinner';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils';

interface LoadingOverlayProps {
  message?: string;
  className?: string;
}

export function LoadingOverlay({ message, className }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

interface LoadingCardProps {
  lines?: number;
  className?: string;
}

export function LoadingCard({ lines = 3, className }: LoadingCardProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
