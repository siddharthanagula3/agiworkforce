/**
 * ComputerUseAppPermissionDialog
 *
 * Global modal that appears when the backend emits `computer_use:app_permission_required`.
 * Asks the user to allow or deny a specific application for computer use.
 */
import { Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ComputerUseAppPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  actionDescription?: string;
  onAllow: () => void;
  onAlwaysAllow: () => void;
  onDeny: () => void;
}

export function ComputerUseAppPermissionDialog({
  open,
  onOpenChange,
  appName,
  actionDescription,
  onAllow,
  onAlwaysAllow,
  onDeny,
}: ComputerUseAppPermissionDialogProps) {
  const handleDeny = () => {
    onDeny();
    onOpenChange(false);
  };

  const handleAllow = () => {
    onAllow();
    onOpenChange(false);
  };

  const handleAlwaysAllow = () => {
    onAlwaysAllow();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 mb-3">
            <Shield className="h-6 w-6 text-amber-500" />
          </div>
          <DialogTitle className="text-center text-lg">
            Allow {appName} for computer use?
          </DialogTitle>
          <DialogDescription className="text-center">
            The agent wants to interact with {appName}.
            {actionDescription ? ` ${actionDescription}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            You can manage app permissions in Settings &gt; Agents &gt; Computer Use.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDeny}>
            Deny
          </Button>
          <Button variant="outline" onClick={handleAllow}>
            Allow Once
          </Button>
          <Button onClick={handleAlwaysAllow}>Always Allow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
