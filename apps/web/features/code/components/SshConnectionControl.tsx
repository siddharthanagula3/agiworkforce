'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  DesktopRuntimeError,
  DEVELOPER_COMMAND_NEEDS_UPDATE,
  getHostBridge,
  type LocalDeveloperSession,
  type SshEnvironment,
} from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const bridge = getHostBridge();
  if (!bridge) throw new Error('SSH environments require the Desktop app.');
  const result = await bridge.invokeRuntime<T>(command, args);
  if (!result.ok)
    throw new DesktopRuntimeError(
      result.error.code === 'unknown-command'
        ? { ...result.error, message: DEVELOPER_COMMAND_NEEDS_UPDATE }
        : result.error,
    );
  return result.value;
}
export function SshConnectionControl({
  onConnected,
  onDisconnected,
}: {
  onConnected(session: LocalDeveloperSession): void;
  onDisconnected(rootId: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [hostAlias, setHostAlias] = useState('');
  const [remotePath, setRemotePath] = useState('');
  const [connections, setConnections] = useState<SshEnvironment[]>([]);
  const { confirm, dialog } = useConfirmAction();
  async function refresh() {
    setConnections(await invoke<SshEnvironment[]>('developer_ssh_list'));
  }
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const session = await invoke<LocalDeveloperSession>('developer_ssh_connect', {
        name,
        hostAlias,
        remotePath,
      });
      onConnected(session);
      setOpen(false);
    } catch (failure) {
      setError(toUserMessage(failure, 'The SSH environment could not connect.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          setOpen(true);
          setError(null);
          void refresh().catch((failure: unknown) =>
            setError(toUserMessage(failure, 'SSH environments could not be read.')),
          );
        }}
      >
        Connect over SSH
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>SSH coding environment</DialogTitle>
            <DialogDescription>
              Connect to an existing AGI CLI on a Unix host. Host keys must already be trusted. Uses
              your SSH agent or default keys; passwords, jump hosts, the host file editor and
              interactive terminals are unsupported. Remote credentials stay on that host.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ssh-name">Connection name</Label>
                <Input
                  id="ssh-name"
                  value={name}
                  maxLength={200}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-alias">SSH host alias</Label>
                <Input
                  id="ssh-alias"
                  value={hostAlias}
                  maxLength={200}
                  required
                  onChange={(event) => setHostAlias(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-project">Remote project path</Label>
                <Input
                  id="ssh-project"
                  value={remotePath}
                  maxLength={1024}
                  required
                  onChange={(event) => setRemotePath(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                {busy ? 'Connecting…' : 'Review and connect'}
              </Button>
            </fieldset>
          </form>
          {connections.length > 0 && (
            <ul className="space-y-2">
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">
                    {connection.name} · {connection.hostAlias}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: 'Disconnect this SSH environment?',
                        description:
                          'This closes its local transport. Reconnect and review any remote work whose completion was not confirmed.',
                        confirmLabel: 'Disconnect',
                        onConfirm: async () => {
                          setBusy(true);
                          try {
                            await invoke('developer_ssh_disconnect', { rootId: connection.id });
                            onDisconnected(connection.id);
                            await refresh();
                          } catch (failure) {
                            setError(
                              toUserMessage(failure, 'The SSH environment could not disconnect.'),
                            );
                          } finally {
                            setBusy(false);
                          }
                        },
                      })
                    }
                  >
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
