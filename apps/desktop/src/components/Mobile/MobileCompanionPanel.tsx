import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useToolStore } from '../../stores/chat/toolStore';
import { QRPairingCard } from './QRPairingCard';
import { RemoteApprovalCard } from './RemoteApprovalCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function MobileCompanionPanel() {
  const { status, peerConnected, stopSession } = useConnectionStore(
    useShallow((s) => ({
      status: s.status,
      peerConnected: s.peerConnected,
      stopSession: s.stopSession,
    })),
  );
  const pendingApprovals = useToolStore((state) => state.pendingApprovals);

  const isConnected = status === 'streaming' || (status === 'pairing' && peerConnected);
  const isPaired = peerConnected;

  // Listen for Tauri events — forwarded by useAgenticEvents hook already, so no
  // duplicate listeners needed. pendingApprovals in toolStore is the source of truth.

  useEffect(() => {
    // Intentionally empty — approval events are handled by useAgenticEvents hook
    // which populates toolStore.pendingApprovals for us.
  }, []);

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-violet-500" />
          <h2 className="text-base font-semibold text-foreground">Mobile Companion</h2>
        </div>
        {isPaired ? (
          <Badge className="bg-emerald-100 text-emerald-700 gap-1">
            <Wifi className="h-3 w-3" />
            Connected
          </Badge>
        ) : (
          <Badge className="bg-slate-100 text-slate-600 gap-1">
            <WifiOff className="h-3 w-3" />
            Not paired
          </Badge>
        )}
      </div>

      {/* Connected device section */}
      {isPaired ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow shadow-emerald-500/40 animate-pulse" />
            <span className="text-sm font-medium text-emerald-800">Mobile device connected</span>
          </div>
          {pendingApprovals.length > 0 && (
            <p className="text-xs text-emerald-700">
              {pendingApprovals.length} pending approval{pendingApprovals.length !== 1 ? 's' : ''}{' '}
              from agent
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={() => stopSession()}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <QRPairingCard />
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending approvals ({pendingApprovals.length})
          </p>
          {pendingApprovals.map((approval) => (
            <RemoteApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      )}

      {/* Empty state when connected but no approvals */}
      {isPaired && pendingApprovals.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <Smartphone className="h-8 w-8 opacity-30" />
          <p className="text-sm">No pending approvals</p>
          <p className="text-xs opacity-70">
            When the AI requests tool use, approvals will appear here.
          </p>
        </div>
      )}

      {/* Status indicator for non-idle states when not yet paired */}
      {!isPaired && (status === 'requesting' || status === 'waiting' || status === 'pairing') && (
        <p className="text-xs text-center text-muted-foreground">
          {status === 'requesting' && 'Generating pairing code...'}
          {status === 'waiting' && 'Waiting for mobile device to scan...'}
          {status === 'pairing' && 'Negotiating secure connection...'}
        </p>
      )}

      {/* Connection status while streaming */}
      {isConnected && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
          Screen sharing active — your mobile can view and approve agent actions remotely.
        </div>
      )}
    </div>
  );
}
