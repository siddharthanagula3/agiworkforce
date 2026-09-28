'use client';

import { useCallback, useState } from 'react';
import { Button } from '@agiworkforce/ui';
import { Check, Copy, Download } from 'lucide-react';

import { toUserMessage } from '@/lib/user-error-message';

const RECOVERY_KEYS_FILE_NAME = 'agi-recovery-keys.txt';

export function RecoveryKeysSheet({
  keys,
  saved,
  onSavedChange,
}: {
  keys: readonly string[];
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyKeys = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${keys.join('\n')}\n`);
      setCopyError(null);
      setCopied(true);
    } catch (error) {
      setCopyError(toUserMessage(error, 'Copying was blocked. Download the keys instead.'));
    }
  }, [keys]);

  const downloadKeys = useCallback(() => {
    const blob = new Blob([`${keys.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = RECOVERY_KEYS_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  }, [keys]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These keys are shown once. Each one works a single time. Store them somewhere safe that you
        can reach without this account, such as a password manager or a printed copy.
      </p>
      <ul
        aria-label="Recovery keys"
        className="grid grid-cols-1 gap-2 rounded-md bg-muted p-3 font-mono text-sm text-foreground sm:grid-cols-2"
      >
        {keys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyKeys()}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Copy keys
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadKeys}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download keys
        </Button>
      </div>
      {copyError ? (
        <p role="alert" className="text-sm text-danger-text">
          {copyError}
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => onSavedChange(event.target.checked)}
        />
        I saved my recovery keys somewhere safe
      </label>
    </div>
  );
}
