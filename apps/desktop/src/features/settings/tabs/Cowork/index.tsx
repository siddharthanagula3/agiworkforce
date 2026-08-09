import { Laptop, Radio, ShieldCheck, Smartphone } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Switch';
import { useConnectionStore } from '@/stores/connectionStore';
import { useCoworkDispatchStore } from '@/stores/coworkDispatchStore';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';

export function CoworkTab() {
  const { enabled, setEnabled } = useCoworkDispatchStore(
    useShallow((state) => ({ enabled: state.enabled, setEnabled: state.setEnabled })),
  );
  const { peerConnected, status } = useConnectionStore(
    useShallow((state) => ({
      peerConnected: state.peerConnected,
      status: state.status,
    })),
  );
  const openSettings = useSettingsDialogStore((state) => state.openSettings);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Laptop className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Cowork</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Control whether a paired phone can start new agent tasks on this Desktop.
        </p>
      </header>

      <section
        aria-labelledby="cowork-dispatch-heading"
        className="overflow-hidden rounded-xl border border-border/70 bg-card"
      >
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <Radio className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h3 id="cowork-dispatch-heading" className="text-sm font-semibold">
                Dispatch
              </h3>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Accept new tasks from your paired AGI Workforce mobile app. Tasks run on this
                computer with the same privacy boundary, tool approvals, and audit trail as tasks
                started here.
              </p>
            </div>
          </div>
          <Switch
            id="cowork-dispatch-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Allow new tasks from a paired mobile device"
          />
        </div>

        <div className="border-t border-border/70 bg-muted/25 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Mobile companion</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  peerConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {peerConnected
                  ? 'Connected'
                  : status === 'waiting'
                    ? 'Waiting to pair'
                    : 'Not paired'}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openSettings('connections')}
            >
              Manage pairing
            </Button>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Local execution authority</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pairing is not enough to start work: Dispatch must also be enabled here. Turning it off
            rejects new remote tasks; tasks already running remain visible and can still be
            cancelled safely.
          </p>
        </div>
      </div>
    </div>
  );
}
