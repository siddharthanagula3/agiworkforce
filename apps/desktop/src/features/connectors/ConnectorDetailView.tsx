import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, Loader2, Shield, Puzzle } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { useIsMounted } from '@/hooks/useIsMounted';
import { Button } from '@/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import {
  type ConnectorPermissionLevel,
  CONNECTOR_PERMISSION_LABEL,
  CONNECTOR_PERMISSION_DESCRIPTION,
  defaultPermissionForTool,
} from '@agiworkforce/types';
import {
  getConnectorPermissionStore,
  type ConnectorPermissionStoreState,
} from '@agiworkforce/unified-chat';
import type { ConnectorDef } from './connectorDefinitions';

export interface ConnectorTool {
  name: string;
  description: string;
  destructive: boolean;
}

interface ConnectorDetailViewProps {
  connector: ConnectorDef;
  tools?: ConnectorTool[] | null;
  onBack: () => void;
}

interface PermissionRowProps {
  tool: ConnectorTool;
  level: ConnectorPermissionLevel;
  onChange: (level: ConnectorPermissionLevel) => void;
  saving: boolean;
}

function PermissionRow({ tool, level, onChange, saving }: PermissionRowProps) {
  const LEVELS: ConnectorPermissionLevel[] = ['always-allow', 'needs-approval', 'blocked'];

  const triggerColor: Record<ConnectorPermissionLevel, string> = {
    'always-allow': 'border-green-500/40 text-green-600 dark:text-green-400',
    'needs-approval': 'border-amber-500/40 text-amber-600 dark:text-amber-400',
    blocked: 'border-destructive/40 text-destructive',
  };

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors">
      {/* Destructive indicator */}
      <div className="mt-1 shrink-0 w-2">
        {tool.destructive && (
          <span
            className="block h-2 w-2 rounded-full bg-destructive"
            title="This tool can modify or delete data"
          />
        )}
      </div>

      {/* Tool info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-none">{tool.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.description}</p>
      </div>

      {/* Permission dropdown */}
      <div className="shrink-0 flex items-center gap-1.5">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Select
          value={level}
          onValueChange={(v) => onChange(v as ConnectorPermissionLevel)}
          disabled={saving}
        >
          <SelectTrigger
            className={`h-7 w-[140px] text-xs py-0 ${triggerColor[level]}`}
            aria-label={`Permission for ${tool.name}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl} className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <span>{CONNECTOR_PERMISSION_LABEL[lvl]}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {CONNECTOR_PERMISSION_DESCRIPTION[lvl]}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ConnectorDetailView({ connector, tools, onBack }: ConnectorDetailViewProps) {
  const resolvedTools: ConnectorTool[] = tools ?? [];
  const toolSchemaUnavailable = tools === undefined || (Array.isArray(tools) && tools.length === 0);

  const [permissions, setPermissions] = useState<Record<string, ConnectorPermissionLevel>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const isMounted = useIsMounted();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storeState, setStoreState] = useState<ConnectorPermissionStoreState | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [keptAs, setKeptAs] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const { confirm: confirmAction, dialog: confirmActionDialog } = useConfirmAction();

  const store = getConnectorPermissionStore();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);

    store
      .list(connector.id)
      .then((saved) => {
        if (cancelled) return;
        const map: Record<string, ConnectorPermissionLevel> = {};
        for (const tool of resolvedTools) {
          map[tool.name] = defaultPermissionForTool(tool.destructive);
        }
        for (const tp of saved.permissions) {
          map[tp.toolName] = tp.level;
        }
        setPermissions(map);
        setStoreState(saved.store);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        const map: Record<string, ConnectorPermissionLevel> = {};
        for (const tool of resolvedTools) {
          map[tool.name] = defaultPermissionForTool(tool.destructive);
        }
        setPermissions(map);
        setStoreState(null);
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector.id, reloads]);

  const storeUnreadable = storeState?.state === 'unreadable' ? storeState : null;

  const requestReset = useCallback(() => {
    confirmAction({
      title: 'Reset connector permissions?',
      description:
        'All saved allow and block choices, for every connector, are cleared. Each connector tool then asks before it runs, and tools that can change or delete data stay blocked until you allow them. The old file is kept beside the new one under a new name; its choices are not brought back.',
      confirmLabel: 'Reset connector permissions',
      onConfirm: async () => {
        if (isMounted.current) setResetError(null);
        try {
          const outcome = await store.reset();
          if (!isMounted.current) return;
          setKeptAs(outcome.keptAs);
          setReloads((count) => count + 1);
        } catch (err) {
          if (isMounted.current) {
            setResetError(err instanceof Error ? err.message : String(err));
          }
          console.error('[ConnectorDetailView] reset failed:', err);
        }
      },
    });
  }, [confirmAction, store, isMounted]);

  const handleChange = useCallback(
    async (tool: ConnectorTool, level: ConnectorPermissionLevel) => {
      setPermissions((prev) => ({ ...prev, [tool.name]: level }));
      setSaving((prev) => ({ ...prev, [tool.name]: true }));
      if (isMounted.current) setSaveError(null);
      try {
        await store.set(connector.id, tool.name, level, tool.destructive);
      } catch (err) {
        if (isMounted.current) {
          const previous = permissions[tool.name] ?? defaultPermissionForTool(tool.destructive);
          setPermissions((prev) => ({ ...prev, [tool.name]: previous }));
          setSaveError(`${tool.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.error('[ConnectorDetailView] save failed:', err);
      } finally {
        if (isMounted.current) {
          setSaving((prev) => ({ ...prev, [tool.name]: false }));
        }
      }
    },
    [connector.id, permissions, store, isMounted],
  );

  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Back to connectors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 flex items-center justify-center h-7 w-7">
            {connector.iconUrl && !logoFailed ? (
              <img
                src={connector.iconUrl}
                alt={connector.name}
                className="h-7 w-7 rounded"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Puzzle className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">{connector.name}</h4>
            <p className="text-xs text-muted-foreground truncate">{connector.description}</p>
          </div>
        </div>
      </div>

      {/* Permission legend */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Set whether each tool runs automatically, requires your approval, or is blocked entirely.
          <span className="ml-1 inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
            Red dot = destructive tool (defaults to Blocked).
          </span>
        </p>
      </div>

      {/* Error banners */}
      {loadError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Could not load saved permissions: {loadError}</span>
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Permission not saved, {saveError}</span>
        </div>
      )}
      {storeUnreadable && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Your saved connector choices could not be read, so every connector is blocked until this
            is fixed.
            {storeUnreadable.unlockMayFix &&
              ' Unlock your saved keys in Settings, under Privacy: an earlier version sealed these choices with your master password, and unlocking brings them back.'}
          </span>
          {!storeUnreadable.unlockMayFix && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={requestReset}>
              Reset connector permissions
            </Button>
          )}
        </div>
      )}
      {resetError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Connector permissions were not reset: {resetError}</span>
        </div>
      )}
      {keptAs && !storeUnreadable && (
        <p role="status" className="px-3 text-xs text-muted-foreground">
          Connector permissions were reset. The old file was kept as {keptAs}.
        </p>
      )}

      {/* Tool list */}
      {storeUnreadable ? null : tools === null || !loaded ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : toolSchemaUnavailable ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
          <Puzzle className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No live tool schema available</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Connect the MCP server and refresh MCP Tools before changing per-tool permissions for
            this connector.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {resolvedTools.map((tool) => (
            <PermissionRow
              key={tool.name}
              tool={tool}
              level={permissions[tool.name] ?? defaultPermissionForTool(tool.destructive)}
              onChange={(level) => void handleChange(tool, level)}
              saving={Boolean(saving[tool.name])}
            />
          ))}
        </div>
      )}
      {confirmActionDialog}
    </div>
  );
}
