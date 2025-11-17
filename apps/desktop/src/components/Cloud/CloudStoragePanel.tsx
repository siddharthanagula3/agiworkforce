// Updated Nov 16, 2025: Added accessible dialogs to replace window.confirm/prompt/alert
import { useEffect, useMemo, useState } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  ClipboardCopy,
  Download,
  FolderPlus,
  Link,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { ScrollArea } from '../ui/ScrollArea';
import { Separator } from '../ui/Separator';
import { useCloudStore } from '../../stores/cloudStore';
import type { CloudProvider } from '../../types/cloud';
import { formatBytes } from '../../lib/utils';
import { cn } from '../../lib/utils';
import { useConfirm } from '../ui/ConfirmDialog';
import { usePrompt } from '../ui/PromptDialog';
import { toast } from 'sonner';

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
  one_drive: 'OneDrive',
};

const PROVIDER_OPTIONS: { value: CloudProvider; label: string }[] = [
  { value: 'google_drive', label: 'Google Drive' },
  { value: 'dropbox', label: 'Dropbox' },
  { value: 'one_drive', label: 'OneDrive' },
];

export function CloudStoragePanel() {
  const {
    accounts,
    activeAccountId,
    files,
    currentPath,
    loading,
    error,
    pendingAuth,
    lastShareLink,
    refreshAccounts,
    selectAccount,
    listFiles,
    beginConnect,
    completeConnect,
    uploadFile,
    downloadFile,
    deleteEntry,
    createFolder,
    shareLink,
    clearError,
  } = useCloudStore();

  const [provider, setProvider] = useState<CloudProvider>('google_drive');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [oauthState, setOauthState] = useState('');
  const [oauthCode, setOauthCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Updated Nov 16, 2025: Use accessible dialogs
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { prompt, dialog: promptDialog } = usePrompt();

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (pendingAuth?.state) {
      setOauthState(pendingAuth.state);
    }
  }, [pendingAuth]);

  const breadcrumb = useMemo(() => {
    const segments = currentPath === '/' ? [''] : currentPath.split('/').filter(Boolean);
    const crumbs = [{ name: 'Root', path: '/' }];

    segments.reduce((acc, segment) => {
      const nextPath = acc.endsWith('/') ? `${acc}${segment}` : `${acc}/${segment}`;
      crumbs.push({ name: segment, path: nextPath });
      return nextPath;
    }, '/');

    return crumbs;
  }, [currentPath]);

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) {
      return files;
    }
    const term = searchTerm.toLowerCase();
    return files.filter((file) => file.name.toLowerCase().includes(term));
  }, [files, searchTerm]);

  const handleRefresh = async () => {
    await refreshAccounts();
    if (activeAccountId) {
      await listFiles(currentPath);
    }
  };

  const handleConnect = async () => {
    await beginConnect(provider, {
      clientId,
      clientSecret,
      redirectUri,
    });
  };

  // Updated Nov 16, 2025: Use toast instead of window.alert
  const handleCompleteConnect = async () => {
    if (!oauthState || !oauthCode) {
      toast.error('State and authorization code are required to complete the flow.');
      return;
    }
    await completeConnect(oauthState.trim(), oauthCode.trim());
    setOauthCode('');
  };

  const handleNavigate = async (path: string) => {
    await listFiles(path);
  };

  const handleOpenFolder = async (path: string) => {
    await listFiles(path);
  };

  const handleUpload = async () => {
    const file = await openDialog({
      title: 'Choose a file to upload',
      multiple: false,
    });
    if (!file) {
      return;
    }

    const selectedPath = Array.isArray(file) ? file[0] : file;
    if (!selectedPath) {
      return;
    }

    const fileName = selectedPath.split(/[\\/]/).pop() ?? 'file';
    const base = currentPath === '/' ? '/' : `${currentPath.replace(/\/+$/, '')}/`;
    const remoteName = `${base}${fileName}`;

    await uploadFile(selectedPath, remoteName);
  };

  const handleDownload = async (path: string, name: string) => {
    const savePath = await saveDialog({
      defaultPath: name,
      title: 'Save file as',
    });

    if (!savePath) {
      return;
    }

    await downloadFile(path, savePath);
  };

  // Updated Nov 16, 2025: Use accessible PromptDialog instead of window.prompt
  const handleCreateFolder = async () => {
    const folderName = await prompt({
      title: 'Create folder',
      description: 'Enter a name for the new folder',
      label: 'Folder name',
      placeholder: 'my-folder',
    });

    if (!folderName) {
      return;
    }

    const normalizedCurrent = currentPath === '/' ? '/' : currentPath.replace(/\/$/, '');
    const remotePath =
      normalizedCurrent === '/' ? `/${folderName}` : `${normalizedCurrent}/${folderName}`;

    await createFolder(remotePath);
  };

  // Updated Nov 16, 2025: Use accessible ConfirmDialog instead of window.confirm
  const handleDelete = async (path: string) => {
    const confirmed = await confirm({
      title: 'Delete item?',
      description: 'Are you sure you want to delete this item? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }
    await deleteEntry(path);
  };

  // Updated Nov 16, 2025: Use toast instead of window.alert
  const handleShare = async (path: string) => {
    const link = await shareLink(path);
    if (link?.url) {
      await navigator.clipboard.writeText(link.url);
      toast.success('Share link copied to clipboard.');
    }
  };

  const renderShareBanner = () => {
    if (!lastShareLink) {
      return null;
    }

    return (
      <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-primary">
        <div className="flex items-center justify-between">
          <span>
            Share link ready: <span className="font-mono">{lastShareLink.url}</span>
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(lastShareLink.url)}
          >
            <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border/60 bg-card/60 p-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Provider</label>
          <Select value={provider} onValueChange={(value: CloudProvider) => setProvider(value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Client ID</label>
          <Input
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="OAuth client ID"
          />
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Client Secret</label>
          <Input
            value={clientSecret}
            type="password"
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder="OAuth client secret"
          />
        </div>

        <div className="flex flex-1 flex-col gap-2 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground">Redirect URI</label>
          <Input
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            placeholder="http://localhost:3000/oauth/callback"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleConnect} disabled={loading}>
            Connect
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {pendingAuth && (
        <div className="rounded-md border border-border/60 bg-muted/60 p-3 text-xs leading-relaxed">
          <div className="font-medium text-muted-foreground">
            Complete OAuth for {PROVIDER_LABELS[pendingAuth.provider]}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                State
              </label>
              <Input value={oauthState} onChange={(event) => setOauthState(event.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Authorization Code
              </label>
              <Input
                value={oauthCode}
                onChange={(event) => setOauthCode(event.target.value)}
                placeholder="Paste the code captured from your redirect URI"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(pendingAuth.authUrl)}
            >
              Copy Auth URL
            </Button>
            <Button size="sm" onClick={handleCompleteConnect}>
              Complete Connection
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="xs" className="ml-4" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {renderShareBanner()}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="flex h-[460px] flex-col rounded-lg border border-border/60 bg-card/60">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="text-sm font-medium text-muted-foreground">Accounts</div>
            <Button variant="ghost" size="xs" onClick={handleRefresh}>
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {accounts.length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                  No accounts connected yet. Authorize above to get started.
                </div>
              )}
              {accounts.map((account) => (
                <button
                  key={account.accountId}
                  type="button"
                  onClick={() => selectAccount(account.accountId)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    account.accountId === activeAccountId
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/70 hover:text-foreground',
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{account.label || account.accountId}</span>
                    <span className="text-xs text-muted-foreground">
                      {PROVIDER_LABELS[account.provider]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex h-[460px] flex-col rounded-lg border border-border/60 bg-card/60">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/20 px-3 py-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {breadcrumb.map((crumb, index) => (
                <div key={crumb.path} className="flex items-center text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => handleNavigate(crumb.path)}
                  >
                    {crumb.name || 'Root'}
                  </button>
                  {index < breadcrumb.length - 1 && (
                    <span className="mx-1 text-muted-foreground">/</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search files..."
                className="h-8 w-44 text-xs"
              />
              <Button size="sm" variant="secondary" onClick={handleCreateFolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Folder
              </Button>
              <Button size="sm" onClick={handleUpload}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Modified</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const isFolder = file.is_folder;
                  return (
                    <tr
                      key={`${file.id}-${file.path}`}
                      className="border-b border-border/40 text-sm hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() =>
                            isFolder ? handleOpenFolder(file.path) : handleShare(file.path)
                          }
                        >
                          {file.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {isFolder ? 'Folder' : file.mime_type || 'File'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {isFolder ? '-' : file.size ? formatBytes(file.size) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {file.modified_at ? new Date(file.modified_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {!isFolder && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDownload(file.path, file.name)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleShare(file.path)}
                            title="Share"
                          >
                            <Link className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(file.path)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredFiles.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-xs text-muted-foreground" colSpan={5}>
                      {loading ? 'Loading files...' : 'Folder is empty.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </div>

      <Separator />

      <div className="text-xs text-muted-foreground">
        Tip: OAuth requires redirect handling. Use a localhost endpoint that captures the `code`
        parameter and paste it above to complete setup.
      </div>

      {/* Updated Nov 16, 2025: Render accessible dialogs */}
      {confirmDialog}
      {promptDialog}
    </div>
  );
}
