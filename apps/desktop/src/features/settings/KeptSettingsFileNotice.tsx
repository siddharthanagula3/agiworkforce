import { useEffect, useState } from 'react';
import { invoke, isTauriContext, listen } from '@/lib/tauri-mock';

const KEPT_EVENT = 'settings:unreadable-file-kept';

export function KeptSettingsFileNotice() {
  const [keptPath, setKeptPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriContext()) return;
    let mounted = true;
    let unlisten: (() => void) | undefined;

    invoke<string | null>('settings_kept_unreadable_file')
      .then((path) => {
        if (mounted && typeof path === 'string') setKeptPath(path);
      })
      .catch(() => undefined);
    void listen<string>(KEPT_EVENT, (event) => {
      if (mounted && typeof event.payload === 'string') setKeptPath(event.payload);
    }).then((stop) => {
      if (mounted) unlisten = stop;
      else stop();
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  if (!keptPath) return null;

  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground"
    >
      Your settings file could not be read, so it was kept as{' '}
      <code className="break-all rounded bg-muted px-1 py-0.5">{keptPath}</code> and a new one was
      written.
    </p>
  );
}
