import { useState } from 'react';
import { Check, Eye, FolderKey, Pencil, Terminal, X } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { useApprovalActions } from '@/hooks/useApprovalActions';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ApprovalRequest } from '@/stores/chat/toolStore';

interface FolderAccessConsentDialogProps {
  approval: ApprovalRequest;
  pendingCount: number;
}

type FolderCapability = 'read' | 'modify' | 'execute';

function readArguments(approval: ApprovalRequest): Record<string, unknown> {
  const args = approval.details['arguments'];
  return args !== null && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function readStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
}

const capabilityCopy: Record<
  FolderCapability,
  { label: string; description: string; icon: typeof Eye }
> = {
  read: {
    label: 'Read files',
    description: 'View file names and contents',
    icon: Eye,
  },
  modify: {
    label: 'Modify files',
    description: 'Create, edit, move, or delete files',
    icon: Pencil,
  },
  execute: {
    label: 'Run commands',
    description: 'Execute commands from these folders',
    icon: Terminal,
  },
};

export function FolderAccessConsentDialog({
  approval,
  pendingCount,
}: FolderAccessConsentDialogProps) {
  const { resolveApproval } = useApprovalActions();
  const setAllowedDirectories = useSettingsStore((state) => state.setAllowedDirectories);
  const [rememberFolders, setRememberFolders] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const args = readArguments(approval);
  const paths = readStringArray(args, 'paths');
  const directories = readStringArray(args, 'directories');
  const capabilities = readStringArray(args, 'capabilities').filter(
    (value): value is FolderCapability => Object.hasOwn(capabilityCopy, value),
  );
  const requestingTool =
    typeof args['requesting_tool'] === 'string'
      ? args['requesting_tool'].replaceAll('_', ' ')
      : null;
  const requestIsValid = paths.length > 0 && directories.length > 0 && capabilities.length > 0;

  const resolve = async (decision: 'approve' | 'reject') => {
    setIsResolving(true);
    setError(null);
    try {
      const resolution = await resolveApproval(approval, decision, {
        trust: decision === 'approve' && rememberFolders,
        reason: decision === 'reject' ? 'Folder access cancelled by user' : undefined,
      });

      if (decision === 'approve' && rememberFolders) {
        if (!resolution?.allowedDirectories) {
          throw new Error('Native settings did not confirm the remembered folders.');
        }
        setAllowedDirectories(resolution.allowedDirectories);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your decision.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="folder-access-consent-title"
      aria-describedby="folder-access-consent-description"
      data-testid="folder-access-consent-dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isResolving) {
          event.preventDefault();
          void resolve('reject');
        }
      }}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <FolderKey className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="folder-access-consent-title" className="text-base font-semibold">
              Allow access to new folders?
            </h2>
            <p
              id="folder-access-consent-description"
              className="mt-1 text-sm text-muted-foreground"
            >
              {requestingTool ? `${requestingTool} needs` : 'The agent needs'} access before it can
              continue. Access lasts for this task/session unless you remember the folders.
            </p>
            {pendingCount > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                1 of {pendingCount} requests awaiting a decision
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section aria-labelledby="folder-access-paths-title">
            <h3
              id="folder-access-paths-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Exact paths requested
            </h3>
            <ul className="mt-2 space-y-2">
              {paths.map((path) => (
                <li key={path}>
                  <code className="block break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                    {path}
                  </code>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="folder-access-capabilities-title">
            <h3
              id="folder-access-capabilities-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Requested capabilities
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {capabilities.map((capability) => {
                const copy = capabilityCopy[capability];
                const Icon = copy.icon;
                return (
                  <div key={capability} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {copy.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="folder-access-roots-title">
            <h3
              id="folder-access-roots-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Folder roots that will be allowed
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Access applies within these existing folders so the requested paths can be used.
            </p>
            <ul className="mt-2 space-y-1">
              {directories.map((directory) => (
                <li key={directory}>
                  <code className="block break-all font-mono text-xs text-foreground">
                    {directory}
                  </code>
                </li>
              ))}
            </ul>
          </section>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              checked={rememberFolders}
              onCheckedChange={(checked) => setRememberFolders(checked === true)}
              aria-describedby="remember-folder-access-description"
            />
            <span>
              <span className="block text-sm font-medium">Remember these folders in Settings</span>
              <span
                id="remember-folder-access-description"
                className="mt-1 block text-xs text-muted-foreground"
              >
                Adds {directories.length === 1 ? 'this folder' : 'these folders'} to Allowed
                Directories. You can revoke access there at any time.
              </span>
            </span>
          </label>

          {!requestIsValid && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              This request is incomplete, so access cannot be granted.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Your decision was not applied. The tool remains blocked. {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="outline"
            autoFocus
            disabled={isResolving}
            onClick={() => void resolve('reject')}
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isResolving || !requestIsValid}
            onClick={() => void resolve('approve')}
          >
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
