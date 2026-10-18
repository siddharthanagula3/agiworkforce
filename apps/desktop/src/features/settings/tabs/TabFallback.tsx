import { Spinner } from '@/ui/Spinner';

export function TabFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
