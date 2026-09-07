'use client';

import React from 'react';
import { Check, Ban, HelpCircle, RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { getDeclaredConnectorActions } from '@/lib/connectors/catalog';
import { describeConnectorActions } from '../data/connectors';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';
import {
  useToolPermissionsStore,
  DEFAULT_PERMISSION_LEVEL,
  type PermissionLevel,
} from '../stores/tool-permissions-store';
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

const TITLE_SUFFIX = 'Tool Permissions';
const PANEL_DESCRIPTION = 'Control which tools this connector can run automatically.';
const DISCOVERING_COPY = 'Discovering connector tools';
const DISCOVERY_FAILED_COPY = 'Tool discovery could not be loaded.';
const DISCOVERY_DEGRADED_COPY = 'Live tool discovery failed; showing known tools.';
const RETRY_LABEL = 'Retry';
const RESET_LABEL = 'Reset all to default';
const RESET_CONFIRM_TITLE = 'Reset every tool permission?';
const RESET_CONFIRM_LABEL = 'Reset permissions';
const SAVING_LABEL = 'Saving this permission';

function resetConfirmDescription(connectorName: string): string {
  return `Every allow and deny you set for ${connectorName} is removed, and each of its tools goes back to asking for approval. This cannot be undone.`;
}

const INACTIVE_CLASS =
  'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground';

const PERMISSION_LEVELS: {
  level: PermissionLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
  activeClass: string;
}[] = [
  {
    level: 'allow',
    label: 'Allow',
    description: 'Always run without asking',
    icon: <Check className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-success-fill bg-success-fill text-success-on-fill',
  },
  {
    level: 'ask',
    label: 'Ask',
    description: 'Needs approval each time',
    icon: <HelpCircle className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-warning-fill bg-warning-fill text-warning-on-fill',
  },
  {
    level: 'deny',
    label: 'Deny',
    description: 'Never run this tool',
    icon: <Ban className="h-3 w-3" aria-hidden="true" />,
    activeClass: 'border-danger-fill bg-danger-fill text-danger-on-fill',
  },
];

interface ToolRowProps {
  connectorId: string;
  toolName: string;
}

function ToolRow({ connectorId, toolName }: ToolRowProps) {
  const setToolPermission = useToolPermissionsStore((s) => s.setToolPermission);
  const current = useToolPermissionsStore(
    (s) => s.permissions[connectorId]?.[toolName] ?? DEFAULT_PERMISSION_LEVEL,
  );
  const saving = useToolPermissionsStore((s) => s.saving[connectorId]?.includes(toolName) ?? false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{toolName}</span>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={`Permission for ${toolName}`}
        aria-busy={saving}
      >
        {saving ? <Spinner size="sm" className="h-3 w-3" aria-label={SAVING_LABEL} /> : null}
        {PERMISSION_LEVELS.map(({ level, label, icon, activeClass }) => (
          <button
            key={level}
            type="button"
            onClick={() => setToolPermission(connectorId, toolName, level)}
            aria-pressed={current === level}
            title={label}
            className={cn(
              'flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-all duration-150',
              current === level ? activeClass : INACTIVE_CLASS,
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
  const { confirm, dialog } = useConfirmAction();
  const { catalog, loading, error, retry } = useConnectorCapabilities(
    connector?.id ?? null,
    open && connector !== null,
  );
  const permissionConnectorId = catalog?.connectorId ?? connector?.id ?? '';
  const saveError = useToolPermissionsStore((s) => s.saveError[permissionConnectorId] ?? null);

  if (!connector) return null;

  const tools: readonly string[] =
    catalog?.tools.map((tool) => tool.name) ?? getDeclaredConnectorActions(connector.id);
  const discovering = loading && tools.length === 0;
  const discoveryFailed = error !== null && tools.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <OfficialConnectorLogo connector={connector} className="h-9 w-9 rounded-lg" />
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  {connector.name} - {TITLE_SUFFIX}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {PANEL_DESCRIPTION}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <PermissionLegend />

            {saveError ? (
              <p
                role="alert"
                className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-danger-text"
              >
                {saveError}
              </p>
            ) : null}

            {discovering ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
                <Spinner size="sm" aria-label={DISCOVERING_COPY} />
                {DISCOVERING_COPY}
              </div>
            ) : discoveryFailed ? (
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-5 text-center">
                <p className="text-sm text-muted-foreground">{DISCOVERY_FAILED_COPY}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 inline-flex min-h-6 items-center px-1 text-xs font-medium underline"
                >
                  {RETRY_LABEL}
                </button>
              </div>
            ) : tools.length > 0 ? (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
                {error ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <span>{DISCOVERY_DEGRADED_COPY}</span>
                    <button
                      type="button"
                      onClick={retry}
                      className="inline-flex min-h-6 items-center px-1 font-medium underline"
                    >
                      {RETRY_LABEL}
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
                onClick={() =>
                  confirm({
                    title: RESET_CONFIRM_TITLE,
                    description: resetConfirmDescription(connector.name),
                    confirmLabel: RESET_CONFIRM_LABEL,
                    onConfirm: () => resetConnectorPermissions(permissionConnectorId),
                  })
                }
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {RESET_LABEL}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
