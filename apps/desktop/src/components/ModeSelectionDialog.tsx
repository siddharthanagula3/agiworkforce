/**
 * ModeSelectionDialog — first-launch mode picker
 *
 * Shows once on first launch (when `hasSelectedMode` is false).
 * User picks Local or Cloud, which sets the app mode and persists
 * the selection so the dialog never appears again.
 */
import { useCallback } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';
import { useAppModeStore, type AppMode } from '../stores/appModeStore';
import { cn } from '../lib/utils';

interface ModeOptionProps {
  mode: AppMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  onSelect: (mode: AppMode) => void;
}

function ModeOption({ mode, icon, title, description, onSelect }: ModeOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-zinc-700/60 bg-zinc-800/50',
        'px-6 py-6 text-center transition-all',
        'hover:border-primary/60 hover:bg-zinc-800 hover:shadow-lg hover:shadow-primary/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700/50">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

interface ModeSelectionDialogProps {
  open: boolean;
}

export function ModeSelectionDialog({ open }: ModeSelectionDialogProps) {
  const handleSelect = useCallback((mode: AppMode) => {
    const store = useAppModeStore.getState();
    store.setMode(mode);
    store.setHasSelectedMode(true);
  }, []);

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md border-zinc-700/60 bg-zinc-900"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center">
          <DialogTitle className="text-xl">How would you like to use AGI Workforce?</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            You can change this later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-2 gap-4">
          <ModeOption
            mode="local"
            icon={<HardDrive className="h-6 w-6 text-emerald-400" />}
            title="Local (Free)"
            description="Run AI models locally. No account needed. Works offline."
            onSelect={handleSelect}
          />
          <ModeOption
            mode="cloud"
            icon={<Cloud className="h-6 w-6 text-blue-400" />}
            title="Cloud"
            description="Use cloud AI models. Requires sign-in. Sync across devices."
            onSelect={handleSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
