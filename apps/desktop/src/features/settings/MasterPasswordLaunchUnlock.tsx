import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { invoke } from '@/lib/tauri-mock';
import { Button } from '@/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import { Input } from '@/ui/Input';
import { Label } from '@/ui/Label';

import { MASTER_PASSWORD_SCOPE } from './masterPasswordScope';
import {
  describeKeysNotUpgraded,
  unlockMasterPassword,
  type MasterPasswordStatus,
} from './masterPasswordVault';

export function MasterPasswordLaunchUnlock() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<MasterPasswordStatus>('master_password_get_status')
      .then((status) => {
        if (!cancelled && status?.is_configured && !status.is_unlocked) setOpen(true);
      })
      .catch((err: unknown) => {
        console.error('Failed to read the master password status at launch:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setUnlocking(true);
    try {
      const result = await unlockMasterPassword(password);
      if (result.success) {
        const leftBehind = describeKeysNotUpgraded(result);
        if (leftBehind)
          toast.warning('Some saved keys were not upgraded', { description: leftBehind });
        setPassword('');
        setOpen(false);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !unlocking && setOpen(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock your saved keys</DialogTitle>
          <DialogDescription>
            {MASTER_PASSWORD_SCOPE} Until you unlock, chats that use your own keys cannot send.
            Local models and your account are not affected.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="launch-master-password">Master password</Label>
            <Input
              id="launch-master-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'launch-master-password-error' : undefined}
              autoFocus
              required
            />
            {error ? (
              <p id="launch-master-password-error" role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={unlocking}
            >
              Not now
            </Button>
            <Button type="submit" disabled={unlocking || password.length === 0}>
              {unlocking ? 'Unlocking' : 'Unlock'}
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground">
            You can unlock later in Settings, under Privacy.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
