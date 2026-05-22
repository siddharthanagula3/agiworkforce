/**
 * ComputerUseConsentDialog
 *
 * Radix Dialog modal matching the "Turn on computer use?" consent flow.
 * Displays safety warnings before enabling computer use capabilities.
 */
import { AlertTriangle, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ComputerUseConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

const WARNINGS = [
  'Some actions can\u2019t be undone.',
  'Apps you approve could open other apps that you haven\u2019t approved.',
  'Websites and docs could contain malicious instructions that misdirect the agent.',
  'Close anything sensitive. The agent can see your screen.',
] as const;

export function ComputerUseConsentDialog({
  open,
  onOpenChange,
  onAccept,
}: ComputerUseConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 mb-3">
            <Shield className="h-6 w-6 text-amber-500" />
          </div>
          <DialogTitle className="text-center text-lg">Turn on computer use?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground text-center">
            AGI Workforce will take screenshots of your screen and control your mouse and keyboard.
            You&apos;ll approve each app, but not confirm each step it performs.
          </p>

          <div className="space-y-3">
            {WARNINGS.map((warning) => (
              <div key={warning} className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-sm text-muted-foreground">{warning}</span>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            This is a research preview. Start with tasks where mistakes are easy to fix.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAccept}>Turn on</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
