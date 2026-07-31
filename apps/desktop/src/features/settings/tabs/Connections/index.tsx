import { MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { MobileCompanionPanel } from '../../../mobile-companion/MobileCompanionPanel';

export function ConnectionsTab() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Connections</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Pair the AGI Workforce mobile app to monitor this Mac and respond to agent approvals.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Control this Mac</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pairing uses a short-lived authenticated code. Screen sharing starts only after a device
            connects, and agent actions still require the approval shown below.
          </p>
        </div>
      </div>

      <section
        data-setting-search-id="remote-control"
        tabIndex={-1}
        aria-label="Mobile companion pairing"
        className="min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card"
      >
        <MobileCompanionPanel />
      </section>
    </div>
  );
}
