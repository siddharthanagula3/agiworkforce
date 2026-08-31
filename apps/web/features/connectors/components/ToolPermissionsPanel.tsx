'use client';

import React from 'react';
import { Check, Ban, HelpCircle, Loader2, RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { getDeclaredConnectorActions } from '@/lib/connectors/catalog';
import { describeConnectorActions } from '../data/connectors';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';
import { useToolPermissionsStore, type PermissionLevel } from '../stores/tool-permissions-store';
import { useConnectorCapabilities } from '../hooks/use-connector-capabilities';

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
    activeClass:
      'border-emerald-600 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-500/60 dark:text-emerald-400',
    inactiveClass:
      'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
  },
  {
    level: 'ask',
    label: 'Ask',
    description: 'Needs approval each time',
    icon: <HelpCircle className="h-3 w-3" aria-hidden="true" />,
    activeClass:
      'border-amber-600 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:border-amber-500/60 dark:text-amber-400',
    inactiveClass:
      'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
  },
  {
    level: 'deny',
    label: 'Deny',
    description: 'Never run this tool',
    icon: <Ban className="h-3 w-3" aria-hidden="true" />,
    activeClass:
      'border-red-600 bg-red-500/15 text-red-700 hover:bg-red-500/20 dark:border-red-500/60 dark:text-red-400',
    inactiveClass:
      'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
  },
];

interface ToolRowProps {
  connectorId: string;
  toolName: string;
}

function ToolRow({ connectorId, toolName }: ToolRowProps) {
  const setToolPermission = useToolPermissionsStore((s) => s.setToolPermission);
  const getToolPermission = useToolPermissionsStore((s) => s.getToolPermission);
  const current = getToolPermission(connectorId, toolName);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
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

function PermissionLegend() {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
      {PERMISSION_LEVELS.map(({ level, label, description, icon, activeClass }) => (
        <div key={level} className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded border text-[12px]',
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

export function ToolPermissionsPanel({ connector, open, onOpenChange }: ToolPermissionsPanelProps) {
  const resetConnectorPermissions = useToolPermissionsStore((s) => s.resetConnectorPermissions);
  const { catalog, loading, error, retry } = useConnectorCapabilities(
    connector?.id ?? null,
    open && connector !== null,
  );

  if (!connector) return null;

  const tools: readonly string[] =
    catalog?.tools.map((tool) => tool.name) ?? getDeclaredConnectorActions(connector.id);
  const permissionConnectorId = catalog?.connectorId ?? connector.id;
  const discovering = loading && tools.length === 0;
  const discoveryFailed = error !== null && tools.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
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
          <PermissionLegend />

          {discovering ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Discovering connector tools…
            </div>
          ) : discoveryFailed ? (
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-5 text-center">
              <p className="text-sm text-muted-foreground">Tool discovery could not be loaded.</p>
              <button
                type="button"
                onClick={retry}
                className="mt-2 inline-flex min-h-6 items-center px-1 text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          ) : tools.length > 0 ? (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
              {error ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span>Live tool discovery failed; showing known tools.</span>
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex min-h-6 items-center px-1 font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {tools.map((toolName) => (
                <ToolRow key={toolName} connectorId={permissionConnectorId} toolName={toolName} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-6">
              <p className="text-sm text-muted-foreground">
                {describeConnectorActions(connector.id)}
              </p>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => resetConnectorPermissions(permissionConnectorId)}
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
