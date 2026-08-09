'use client';

/**
 * ⚠️ CALLERS MUST GATE ON WIRE TOOL NAMES.
 *
 * This panel writes tool-permission decisions keyed by whatever strings
 * CONNECTOR_TOOLS (config/connector-logos.ts) contains for the connector. The
 * store's real consumers — useChatStream's approval auto-resolve and
 * ToolTimeline's ToolPermissionQuickPicker — key by the WIRE tool name parsed
 * from `mcp__<serverId>__<toolName>`. Today only the github entry in
 * CONNECTOR_TOOLS holds wire names; every other connector's list is
 * display-label marketing copy with no backing implementation, so opening
 * this panel for those would save decisions under keys nothing ever reads
 * (silent no-op permissions). Operator-mapped and custom connectors advertise
 * their tool names at runtime from the remote catalog, which this static
 * config cannot know.
 *
 * ConnectorsPage is the only caller. It renders this dialog for a connected
 * connector but only ever opens it behind `hasWireToolNames(connector.id)`
 * (pages/ConnectorsPage.tsx), which is GitHub-only — that gate, not this
 * component, is what keeps the keys honest. Widen it only once connector tool
 * lists are server-derived. The live per-tool permission UX for everything
 * else is the quick picker on the approval card in ToolTimeline.
 */
import React from 'react';
import { Check, Ban, HelpCircle, RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { getConnectorTools } from '../config/connector-logos';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';
import { useToolPermissionsStore, type PermissionLevel } from '../stores/tool-permissions-store';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConnectorInfo {
  id: string;
  name: string;
  iconEmoji?: string;
  iconText: string;
  iconBg: string;
}

interface ToolPermissionsPanelProps {
  connector: ConnectorInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Permission config ─────────────────────────────────────────────────────────

const PERMISSION_LEVELS: {
  level: PermissionLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    level: 'allow',
    label: 'Allow',
    description: 'Always run without asking',
    icon: <Check className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20',
    inactiveClass:
      'border-white/[0.06] bg-transparent text-muted-foreground hover:border-white/[0.12] hover:text-foreground',
  },
  {
    level: 'ask',
    label: 'Ask',
    description: 'Needs approval each time',
    icon: <HelpCircle className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-amber-500/60 bg-amber-500/15 text-amber-400 hover:bg-amber-500/20',
    inactiveClass:
      'border-white/[0.06] bg-transparent text-muted-foreground hover:border-white/[0.12] hover:text-foreground',
  },
  {
    level: 'deny',
    label: 'Deny',
    description: 'Never run this tool',
    icon: <Ban className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500/20',
    inactiveClass:
      'border-white/[0.06] bg-transparent text-muted-foreground hover:border-white/[0.12] hover:text-foreground',
  },
];

// ─── ToolRow ───────────────────────────────────────────────────────────────────

interface ToolRowProps {
  connectorId: string;
  toolName: string;
}

function ToolRow({ connectorId, toolName }: ToolRowProps) {
  const setToolPermission = useToolPermissionsStore((s) => s.setToolPermission);
  const getToolPermission = useToolPermissionsStore((s) => s.getToolPermission);
  const current = getToolPermission(connectorId, toolName);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{toolName}</span>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={`Permission for ${toolName}`}
      >
        {PERMISSION_LEVELS.map(({ level, label, icon, activeClass, inactiveClass }) => (
          <button
            key={level}
            onClick={() => setToolPermission(connectorId, toolName, level)}
            aria-pressed={current === level}
            title={label}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-all duration-150',
              current === level ? activeClass : inactiveClass,
            )}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PermissionLegend ──────────────────────────────────────────────────────────

function PermissionLegend() {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
      {PERMISSION_LEVELS.map(({ level, label, description, icon, activeClass }) => (
        <div key={level} className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded border text-[10px]',
              activeClass,
            )}
          >
            {icon}
          </span>
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{label}</span>
            {' - '}
            {description}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── ToolPermissionsPanel ──────────────────────────────────────────────────────

export function ToolPermissionsPanel({ connector, open, onOpenChange }: ToolPermissionsPanelProps) {
  const resetConnectorPermissions = useToolPermissionsStore((s) => s.resetConnectorPermissions);

  if (!connector) return null;

  const tools = getConnectorTools(connector.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.08] bg-[#0f0e0d] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <OfficialConnectorLogo connector={connector} className="h-9 w-9 rounded-lg" />
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                {connector.name} - Tool Permissions
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Control which tools this connector can run automatically.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Legend */}
          <PermissionLegend />

          {/* Tool list */}
          {tools.length > 0 ? (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
              {tools.map((toolName) => (
                <ToolRow key={toolName} connectorId={connector.id} toolName={toolName} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No tools defined for this connector yet.
              </p>
            </div>
          )}

          {/* Reset button */}
          <div className="flex justify-end border-t border-white/[0.06] pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => resetConnectorPermissions(connector.id)}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset all to default
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
