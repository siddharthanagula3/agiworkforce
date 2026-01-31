/**
 * Extensions Settings Component
 *
 * UI component for managing MCP extensions in the Settings panel.
 * Allows users to install, uninstall, enable, and disable extensions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Loader2,
  Package,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { invoke, listen } from '@/lib/tauri-mock';
import { toast } from '@/hooks/useToast';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import { useConfirm } from '../ui/ConfirmDialog';

// Types matching the Rust backend
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

export function ExtensionsSettings() {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Load extensions list
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

  // Initial load
  useEffect(() => {
    void loadExtensions();
  }, [loadExtensions]);

  // Listen for extension events
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    // Listen for install progress
    unlisteners.push(
      listen<InstallProgress>('extension:install_progress', (event) => {
        setInstallProgress(event.payload);
      }),
    );

    // Listen for install completed
    unlisteners.push(
      listen<{ extensionId: string; name: string }>('extension:install_completed', (event) => {
        toast({
          title: 'Extension installed',
          description: `${event.payload.name} has been installed successfully.`,
          variant: 'success',
        });
        setInstalling(false);
        setInstallProgress(null);
        void loadExtensions();
      }),
    );

    // Listen for install failed
    unlisteners.push(
      listen<{ error: string }>('extension:install_failed', (event) => {
        toast({
          title: 'Installation failed',
          description: event.payload.error,
          variant: 'destructive',
        });
        setInstalling(false);
        setInstallProgress(null);
      }),
    );

    // Listen for uninstall
    unlisteners.push(
      listen<{ extensionId: string }>('extension:uninstalled', () => {
        void loadExtensions();
      }),
    );

    // Listen for enable/disable
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

  // Handle install button click
  const handleInstall = async () => {
    try {
      setInstalling(true);
      setInstallProgress({
        phase: 'selecting',
        message: 'Select an extension package...',
        percentage: 0,
      });

      // Open file picker for .agiext files
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

      // Install the extension
      await invoke<ExtensionInfo>('extension_install', { filePath });
      // Success handled by event listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Installation failed';
      toast({
        title: 'Installation failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setInstalling(false);
      setInstallProgress(null);
    }
  };

  // Handle uninstall
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
      toast({
        title: 'Extension uninstalled',
        description: `${extension.name} has been removed.`,
        variant: 'success',
      });
      void loadExtensions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to uninstall extension';
      toast({
        title: 'Uninstall failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle enable/disable
  const handleToggleEnabled = async (extension: ExtensionInfo) => {
    const isEnabled = extension.status === 'enabled' || extension.status === 'running';

    try {
      setActionInProgress(extension.id);

      if (isEnabled) {
        await invoke<string>('extension_disable', { extensionId: extension.id });
        toast({
          title: 'Extension disabled',
          description: `${extension.name} has been disabled.`,
        });
      } else {
        await invoke<string>('extension_enable', { extensionId: extension.id });
        toast({
          title: 'Extension enabled',
          description: `${extension.name} is now running.`,
          variant: 'success',
        });
      }

      void loadExtensions();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : `Failed to ${isEnabled ? 'disable' : 'enable'} extension`;
      toast({
        title: `${isEnabled ? 'Disable' : 'Enable'} failed`,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Get status badge variant
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

  // Format date
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
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
        <div className="p-3 bg-muted/50 border-b text-sm font-medium flex items-center justify-between">
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
              {extensions.map((extension) => (
                <div key={extension.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{extension.name}</h4>
                        <span className="text-xs text-muted-foreground">v{extension.version}</span>
                        {getStatusBadge(extension.status)}
                        {extension.requiresConfig && !extension.configComplete && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-500/50">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggleEnabled(extension)}
                        disabled={
                          actionInProgress === extension.id ||
                          extension.status === 'updating' ||
                          extension.status === 'pending_removal'
                        }
                      >
                        {actionInProgress === extension.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : extension.status === 'running' || extension.status === 'enabled' ? (
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
                        disabled={
                          actionInProgress === extension.id ||
                          extension.status === 'updating' ||
                          extension.status === 'pending_removal'
                        }
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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
