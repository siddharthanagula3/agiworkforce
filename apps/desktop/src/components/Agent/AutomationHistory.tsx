import { Clock } from 'lucide-react';

interface AutomationHistoryProps {
  className?: string;
}

export function AutomationHistory({ className }: AutomationHistoryProps) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground ${className ?? ''}`}
    >
      <Clock className="h-10 w-10 opacity-70" />
      <div className="max-w-lg space-y-2">
        <p className="text-lg font-semibold text-foreground">Automation timeline coming soon</p>
        <p className="text-sm">
          Autopilot runs will appear here with step-by-step transcripts, diffs, and status events.
          Once the agent runtime is online, you will be able to replay or schedule tasks from this
          view.
        </p>
      </div>
    </div>
  );
}
