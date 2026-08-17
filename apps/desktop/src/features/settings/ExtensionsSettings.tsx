import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  Package,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { invoke, listen } from '@/lib/tauri-mock';
import { toast } from 'sonner';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { ScrollArea } from '@/ui/ScrollArea';
import { useConfirm } from '@/ui/ConfirmDialog';
import { openExternalUrl } from '../../utils/navigation';

type ExtensionStatus =
  | 'disabled'
  | 'enabled'
  | 'running'
  | 'error'
  | 'updating'
  | 'pending_removal';

interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: ExtensionStatus;
  lastError: string | null;
  installPath: string;
  toolCount: number;
  tools: string[];
  requiresConfig: boolean;
  configComplete: boolean;
  configSchema: unknown | null;
  category: string | null;
  iconPath: string | null;
  installedAt: string;
  updatedAt: string;
  useCount: number;
}

interface InstallProgress {
  phase: string;
  message: string;
  percentage: number;
}

interface ExtensionConfigProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  sensitive?: boolean;
  required?: boolean;
  enum?: string[];
  placeholder?: string;
  helpUrl?: string;
}

interface ExtensionConfigSchema {
  properties: Record<string, ExtensionConfigProperty>;
  required: string[];
}

type ConfigFieldValue = string | boolean;

function parseConfigSchema(raw: unknown): ExtensionConfigSchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { properties?: unknown; required?: unknown };
  if (!source.properties || typeof source.properties !== 'object') return null;

  const properties: Record<string, ExtensionConfigProperty> = {};
  for (const [key, value] of Object.entries(source.properties as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      properties[key] = value as ExtensionConfigProperty;
    }
  }
  if (Object.keys(properties).length === 0) return null;

  const declared = Array.isArray(source.required)
    ? source.required.filter((key): key is string => typeof key === 'string')
    : [];
  const flagged = Object.entries(properties)
    .filter(([, property]) => property.required === true)
    .map(([key]) => key);

  return { properties, required: Array.from(new Set([...declared, ...flagged])) };
}

function fieldLabel(key: string, property: ExtensionConfigProperty | undefined): string {
  return property?.title?.trim() || key;
}

function seedFieldValues(
  schema: ExtensionConfigSchema,
  stored: Record<string, unknown>,
): Record<string, ConfigFieldValue> {
  const values: Record<string, ConfigFieldValue> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    const current = stored[key] ?? property.default;
    if (property.type === 'boolean') {
      values[key] = current === true;
    } else {
      values[key] = current === undefined || current === null ? '' : String(current);
    }
  }
  return values;
}

// The Rust side rejects a config whose value type does not match the declared
// property type, so numbers and booleans must not be sent as strings.
function buildConfigPayload(
  schema: ExtensionConfigSchema,
  values: Record<string, ConfigFieldValue>,
): { config: Record<string, unknown> } | { error: string } {
  const config: Record<string, unknown> = {};

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = values[key];

    if (property.type === 'boolean') {
      config[key] = value === true;
      continue;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') continue;

    if (property.type === 'number') {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        return { error: `${fieldLabel(key, property)} must be a number.` };
      }
      config[key] = parsed;
      continue;
    }

    config[key] = text;
  }

  const missing = schema.required.filter((key) => config[key] === undefined);
  if (missing.length > 0) {
    return {
      error: `Fill in required settings: ${missing
        .map((key) => fieldLabel(key, schema.properties[key]))
        .join(', ')}.`,
    };
  }

  return { config };
}

function safeHelpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ExtensionsSettings() {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configSchema, setConfigSchema] = useState<ExtensionConfigSchema | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, ConfigFieldValue>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const configRequestRef = useRef<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const loadExtensions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<ExtensionInfo[]>('extension_list');
      setExtensions(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load extensions';
      setError(errorMessage);
      console.error('Error loading extensions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExtensions();
  }, [loadExtensions]);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<InstallProgress>('extension:install_progress', (event) => {
        setInstallProgress(event.payload);
      }),
    );

    unlisteners.push(
      listen<{ extensionId: string; name: string }>('extension:install_completed', (event) => {
        toast.success('Extension installed', {
          description: `${event.payload.name} has been installed successfully.`,
        });
        setInstalling(false);
        setInstallProgress(null);
        void loadExtensions();
      }),
    );

    unlisteners.push(
      listen<{ error: string }>('extension:install_failed', (event) => {
        toast.error('Installation failed', {
          description: event.payload.error,
        });
        setInstalling(false);
        setInstallProgress(null);
      }),
    );

    unlisteners.push(
      listen<{ extensionId: string }>('extension:uninstalled', () => {
        void loadExtensions();
      }),
    );

    unlisteners.push(
      listen<{ extensionId: string }>('extension:enabled', () => {
        void loadExtensions();
      }),
    );

    unlisteners.push(
      listen<{ extensionId: string }>('extension:disabled', () => {
        void loadExtensions();
      }),
    );

    return () => {
      unlisteners.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(console.error);
      });
    };
  }, [loadExtensions]);

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setInstallProgress({
        phase: 'selecting',
        message: 'Select an extension package...',
        percentage: 0,
      });

      const filePath = await invoke<string | null>('extension_select_package');

      if (!filePath) {
        setInstalling(false);
        setInstallProgress(null);
        return;
      }

      setInstallProgress({
        phase: 'installing',
        message: 'Installing extension...',
        percentage: 10,
      });

      await invoke<ExtensionInfo>('extension_install', { filePath });
      // Success handled by event listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Installation failed';
      toast.error('Installation failed', {
        description: errorMessage,
      });
      setInstalling(false);
      setInstallProgress(null);
    }
  };

  const handleUninstall = async (extension: ExtensionInfo) => {
    const confirmed = await confirm({
      title: 'Uninstall Extension',
      description: `Are you sure you want to uninstall "${extension.name}"? This will remove the extension and all its data.`,
      confirmText: 'Uninstall',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      setActionInProgress(extension.id);
      await invoke<string>('extension_uninstall', { extensionId: extension.id });
      toast.success('Extension uninstalled', {
        description: `${extension.name} has been removed.`,
      });
      void loadExtensions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to uninstall extension';
      toast.error('Uninstall failed', {
        description: errorMessage,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleEnabled = async (extension: ExtensionInfo) => {
    const isEnabled = extension.status === 'enabled' || extension.status === 'running';

    try {
      setActionInProgress(extension.id);

      if (isEnabled) {
        await invoke<string>('extension_disable', { extensionId: extension.id });
        toast.message('Extension disabled', {
          description: `${extension.name} has been disabled.`,
        });
      } else {
        await invoke<string>('extension_enable', { extensionId: extension.id });
        toast.success('Extension enabled', {
          description: `${extension.name} is now running.`,
        });
      }

      void loadExtensions();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : `Failed to ${isEnabled ? 'disable' : 'enable'} extension`;
      toast.error(`${isEnabled ? 'Disable' : 'Enable'} failed`, {
        description: errorMessage,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const closeConfig = useCallback(() => {
    configRequestRef.current = null;
    setConfiguringId(null);
    setConfigSchema(null);
    setConfigValues({});
    setConfigError(null);
    setConfigLoading(false);
  }, []);

  const handleOpenConfig = useCallback(
    async (extension: ExtensionInfo) => {
      if (configuringId === extension.id) {
        closeConfig();
        return;
      }

      const schema = parseConfigSchema(extension.configSchema);
      if (!schema) return;

      configRequestRef.current = extension.id;
      setConfiguringId(extension.id);
      setConfigSchema(schema);
      setConfigValues(seedFieldValues(schema, {}));
      setConfigError(null);
      setConfigLoading(true);

      try {
        const stored = await invoke<Record<string, unknown> | null>('extension_get_config', {
          extensionId: extension.id,
        });
        if (configRequestRef.current !== extension.id) return;
        setConfigValues(seedFieldValues(schema, stored ?? {}));
      } catch (err) {
        if (configRequestRef.current !== extension.id) return;
        setConfigError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        if (configRequestRef.current === extension.id) setConfigLoading(false);
      }
    },
    [closeConfig, configuringId],
  );

  const handleSaveConfig = useCallback(
    async (extension: ExtensionInfo) => {
      if (!configSchema) return;

      const result = buildConfigPayload(configSchema, configValues);
      if ('error' in result) {
        setConfigError(result.error);
        return;
      }

      setConfigSaving(true);
      setConfigError(null);

      try {
        await invoke<string>('extension_set_config', {
          extensionId: extension.id,
          config: result.config,
        });
        toast.success('Configuration saved', {
          description: `${extension.name} configuration has been updated.`,
        });
        closeConfig();
        void loadExtensions();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save configuration';
        setConfigError(errorMessage);
        toast.error('Save failed', { description: errorMessage });
      } finally {
        setConfigSaving(false);
      }
    },
    [closeConfig, configSchema, configValues, loadExtensions],
  );

  const setConfigField = useCallback((key: string, value: ConfigFieldValue) => {
    setConfigValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  const getStatusBadge = (status: ExtensionStatus) => {
    switch (status) {
      case 'running':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
            <Play className="h-3 w-3 mr-1" />
            Running
          </Badge>
        );
      case 'enabled':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            <Check className="h-3 w-3 mr-1" />
            Enabled
          </Badge>
        );
      case 'disabled':
        return (
          <Badge variant="secondary">
            <PowerOff className="h-3 w-3 mr-1" />
            Disabled
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case 'updating':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Updating
          </Badge>
        );
      case 'pending_removal':
        return (
          <Badge variant="destructive">
            <Trash2 className="h-3 w-3 mr-1" />
            Removing
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}

      <div>
        <h3 className="text-lg font-semibold mb-2">Extensions</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Install and manage MCP extensions to add new capabilities to AGI Workforce. Extensions can
          provide tools for email, calendars, databases, and more.
        </p>
      </div>

      {/* Install Button */}
      <div className="flex items-center gap-4">
        <Button onClick={handleInstall} disabled={installing}>
          {installing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Install Extension
            </>
          )}
        </Button>
        <Button variant="outline" onClick={() => void loadExtensions()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Install Progress */}
      {installProgress && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{installProgress.message}</p>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${installProgress.percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Extensions List */}
      <div className="border rounded-md">
        <div className="p-3 bg-card border-b text-sm font-medium flex items-center justify-between">
          <span>Installed Extensions ({extensions.length})</span>
        </div>

        <ScrollArea className="h-[400px]">
          {loading && extensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm">Loading extensions...</p>
            </div>
          ) : extensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <Package className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm font-medium">No extensions installed</p>
              <p className="text-xs text-center mt-1">
                Install .agiext packages to add new capabilities.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {extensions.map((extension) => {
                const schema = parseConfigSchema(extension.configSchema);
                const isEnabled = extension.status === 'enabled' || extension.status === 'running';
                const needsConfig = extension.requiresConfig && !extension.configComplete;
                const busy =
                  actionInProgress === extension.id ||
                  extension.status === 'updating' ||
                  extension.status === 'pending_removal';

                return (
                  <div key={extension.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">{extension.name}</h4>
                          <span className="text-xs text-muted-foreground">
                            v{extension.version}
                          </span>
                          {getStatusBadge(extension.status)}
                          {extension.requiresConfig && !extension.configComplete && (
                            <Badge
                              variant="outline"
                              className="text-yellow-600 border-yellow-500/50"
                            >
                              Config Required
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {extension.description}
                        </p>

                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {extension.author && <span>By {extension.author}</span>}
                          <span>
                            {extension.toolCount} tool{extension.toolCount !== 1 ? 's' : ''}
                          </span>
                          <span>
                            Used {extension.useCount} time{extension.useCount !== 1 ? 's' : ''}
                          </span>
                          <span>Installed {formatDate(extension.installedAt)}</span>
                        </div>

                        {extension.tools.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {extension.tools.slice(0, 5).map((tool) => (
                              <Badge key={tool} variant="outline" className="text-xs">
                                {tool}
                              </Badge>
                            ))}
                            {extension.tools.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{extension.tools.length - 5} more
                              </Badge>
                            )}
                          </div>
                        )}

                        {extension.status === 'error' && extension.lastError && (
                          <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            {extension.lastError}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {schema && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleOpenConfig(extension)}
                            aria-expanded={configuringId === extension.id}
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            Configure
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggleEnabled(extension)}
                          disabled={busy || (!isEnabled && needsConfig)}
                          title={
                            !isEnabled && needsConfig
                              ? 'Add the required configuration before enabling this extension.'
                              : undefined
                          }
                        >
                          {actionInProgress === extension.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isEnabled ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-1" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-1" />
                              Enable
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleUninstall(extension)}
                          disabled={busy}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {configuringId === extension.id && configSchema && (
                      <div className="mt-3 rounded-md border border-border bg-card p-3 space-y-3">
                        <p className="text-sm font-medium">Extension settings</p>

                        {configLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading configuration...
                          </div>
                        ) : (
                          Object.entries(configSchema.properties).map(([key, property]) => {
                            const label = fieldLabel(key, property);
                            const required = configSchema.required.includes(key);
                            const helpUrl = safeHelpUrl(property.helpUrl);
                            const inputId = `ext-config-${extension.id}-${key}`;
                            const value = configValues[key];

                            return (
                              <div key={key} className="space-y-1">
                                <label
                                  htmlFor={inputId}
                                  className="text-xs font-medium flex items-center gap-1"
                                >
                                  {label}
                                  {required && <span className="text-destructive">*</span>}
                                </label>

                                {property.type === 'boolean' ? (
                                  <input
                                    id={inputId}
                                    type="checkbox"
                                    checked={value === true}
                                    onChange={(event) => setConfigField(key, event.target.checked)}
                                    className="h-4 w-4 rounded border-input"
                                  />
                                ) : property.enum && property.enum.length > 0 ? (
                                  <select
                                    id={inputId}
                                    value={typeof value === 'string' ? value : ''}
                                    onChange={(event) => setConfigField(key, event.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    <option value="">Not set</option>
                                    {property.enum.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={inputId}
                                    type={
                                      property.sensitive
                                        ? 'password'
                                        : property.type === 'number'
                                          ? 'number'
                                          : 'text'
                                    }
                                    value={typeof value === 'string' ? value : ''}
                                    placeholder={property.placeholder}
                                    onChange={(event) => setConfigField(key, event.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  />
                                )}

                                {property.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {property.description}
                                  </p>
                                )}
                                {helpUrl && (
                                  <button
                                    type="button"
                                    className="text-xs text-primary inline-flex items-center gap-1"
                                    onClick={() => void openExternalUrl(helpUrl)}
                                  >
                                    Where do I find this?
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}

                        {configError && (
                          <p className="text-xs text-destructive" role="alert">
                            {configError}
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleSaveConfig(extension)}
                            disabled={configLoading || configSaving}
                          >
                            {configSaving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                Saving...
                              </>
                            ) : (
                              'Save configuration'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={closeConfig}
                            disabled={configSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Extensions are packaged as .agiext files containing MCP server implementations.</p>
        <p>Enabled extensions run automatically and provide tools that AGI Workforce can use.</p>
      </div>
    </div>
  );
}

export default ExtensionsSettings;
