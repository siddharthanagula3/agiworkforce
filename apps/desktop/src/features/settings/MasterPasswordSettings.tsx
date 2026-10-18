import { invoke } from '@/lib/tauri-mock';
import { Eye, EyeOff, KeyRound, Lock, LockOpen, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Label } from '@/ui/Label';

import { MASTER_PASSWORD_SCOPE } from './masterPasswordScope';
import {
  changeMasterPassword,
  describeKeysNotUpgraded,
  describePasswordPolicy,
  describePasswordRuleViolation,
  lockMasterPassword,
  passwordRuleViolation,
  refusalMessage,
  removeMasterPassword,
  setUpMasterPassword,
  unlockMasterPassword,
  type MasterPasswordStatus,
  type PasswordPolicy,
} from './masterPasswordVault';

interface VaultMigrationReport {
  api_keys_migrated: number;
  rows_skipped_already_modern: number;
  rows_skipped_undecryptable: number;
}

type View = 'status' | 'setup' | 'unlock' | 'change' | 'remove' | 'migration';

export function MasterPasswordSettings() {
  const [status, setStatus] = useState<MasterPasswordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>('status');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await invoke<MasterPasswordStatus>('master_password_get_status');
      setStatus(s);
    } catch (err) {
      console.error('Failed to load master password status:', err);
      setStatus(null);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleDone = useCallback(() => {
    setView('status');
    void loadStatus();
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading security status...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-6 space-y-3">
        <p className="text-sm text-foreground">
          Whether a master password protects your saved keys could not be read. {loadError}
        </p>
        <Button size="sm" variant="outline" onClick={() => void loadStatus()}>
          Try again
        </Button>
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <SetupView
        policy={status?.password_policy}
        onDone={handleDone}
        onCancel={() => setView('status')}
      />
    );
  }

  if (view === 'unlock') {
    return <UnlockView onDone={handleDone} onCancel={() => setView('status')} />;
  }

  if (view === 'change') {
    return (
      <ChangeView
        policy={status?.password_policy}
        onDone={handleDone}
        onCancel={() => setView('status')}
      />
    );
  }

  if (view === 'remove') {
    return <RemoveView onDone={handleDone} onCancel={() => setView('status')} />;
  }

  if (view === 'migration') {
    return <MigrationView onDone={handleDone} onCancel={() => setView('status')} />;
  }

  return (
    <StatusView
      status={status}
      onSetup={() => setView('setup')}
      onUnlock={() => setView('unlock')}
      onLock={async () => {
        try {
          await lockMasterPassword();
          await loadStatus();
        } catch (err) {
          console.error('Failed to lock master password:', err);
          toast.error('Lock failed', {
            description: 'Failed to lock. Please try again.',
          });
        }
      }}
      onChange={() => setView('change')}
      onRemove={() => setView('remove')}
      onMigrate={() => setView('migration')}
    />
  );
}

interface StatusViewProps {
  status: MasterPasswordStatus | null;
  onSetup: () => void;
  onUnlock: () => void;
  onLock: () => void;
  onChange: () => void;
  onRemove: () => void;
  onMigrate: () => void;
}

function StatusView({
  status,
  onSetup,
  onUnlock,
  onLock,
  onChange,
  onRemove,
  onMigrate,
}: StatusViewProps) {
  const isConfigured = status?.is_configured ?? false;
  const isUnlocked = status?.is_unlocked ?? false;
  const needsMigration = status?.needs_migration ?? false;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-full p-2 ${isConfigured ? (isUnlocked ? 'bg-success-fill/10' : 'bg-warning-fill/10') : 'bg-muted'}`}
          >
            {isConfigured ? (
              isUnlocked ? (
                <LockOpen className="h-4 w-4 text-success-text" />
              ) : (
                <Lock className="h-4 w-4 text-warning-text" />
              )
            ) : (
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isConfigured ? (isUnlocked ? 'Unlocked' : 'Locked') : 'Not configured'}
            </p>
            {status?.last_changed && (
              <p className="text-xs text-muted-foreground">
                Password last changed: {new Date(status.last_changed).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isConfigured && (
            <Button size="sm" onClick={onSetup}>
              Set Up
            </Button>
          )}
          {isConfigured && !isUnlocked && (
            <Button size="sm" variant="outline" onClick={onUnlock}>
              Unlock
            </Button>
          )}
          {isConfigured && isUnlocked && (
            <>
              <Button size="sm" variant="outline" onClick={onChange}>
                Change
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void onLock()}>
                Lock
              </Button>
            </>
          )}
          {isConfigured && (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {!isConfigured && (
        <p className="text-xs text-muted-foreground">
          {MASTER_PASSWORD_SCOPE} Sealed keys can only be used while unlocked.
        </p>
      )}

      {needsMigration && (
        <div className="rounded-md border border-warning-fill/30 bg-warning-fill/10 p-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-warning-text">
              Some saved keys are not protected yet
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isUnlocked
                ? 'Some provider API keys were saved before your master password protected them, and can still be used while locked. Re-encrypt them with your master password.'
                : 'Some provider API keys were saved before your master password protected them, and can still be used while locked. Unlock to re-encrypt them.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={isUnlocked ? onMigrate : onUnlock}
          >
            {isUnlocked ? 'Migrate' : 'Unlock'}
          </Button>
        </div>
      )}
    </div>
  );
}

interface SetupViewProps {
  policy: PasswordPolicy | undefined;
  onDone: () => void;
  onCancel: () => void;
}

function SetupView({ policy, onDone, onCancel }: SetupViewProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const violation = policy ? passwordRuleViolation(password, policy) : null;
    if (violation) {
      setError(describePasswordRuleViolation(violation));
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await setUpMasterPassword(password);
      if (result.success) {
        onDone();
      } else {
        setError(refusalMessage(result));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Set Up Master Password</h4>
      </div>
      <p id="mp-new-rule" className="text-xs text-muted-foreground">
        {policy
          ? describePasswordPolicy(policy)
          : 'Choose a password you do not use anywhere else.'}{' '}
        It seals your saved provider API keys using Argon2id with OWASP-recommended parameters.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="mp-new">Password</Label>
          <div className="relative">
            <Input
              id="mp-new"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New master password"
              aria-describedby="mp-new-rule"
              className="pr-9"
              required
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mp-confirm">Confirm Password</Label>
          <Input
            id="mp-confirm"
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Setting up...' : 'Set Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface UnlockViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function UnlockView({ onDone, onCancel }: UnlockViewProps) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await unlockMasterPassword(password);
      if (result.success) {
        const leftBehind = describeKeysNotUpgraded(result);
        if (leftBehind)
          toast.warning('Some saved keys were not upgraded', { description: leftBehind });
        onDone();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Unlock</h4>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="mp-unlock">Master Password</Label>
          <div className="relative">
            <Input
              id="mp-unlock"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your master password"
              className="pr-9"
              autoFocus
              required
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Unlocking...' : 'Unlock'}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface RemoveViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function RemoveView({ onDone, onCancel }: RemoveViewProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await removeMasterPassword(password);
      if (result.success) {
        toast.success('Master password removed', {
          description: 'Your saved keys are protected by this device again. Nothing was deleted.',
        });
        onDone();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <LockOpen className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Remove Master Password</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Your saved provider API keys go back to being protected by this device&apos;s key alone, so
        anyone using this account on this computer can use them without a password. Nothing is
        deleted, and you can set a master password again later.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="mp-remove">Master Password</Label>
          <Input
            id="mp-remove"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your master password"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'mp-remove-error' : undefined}
            autoFocus
            required
          />
        </div>

        {error && (
          <p id="mp-remove-error" role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || password.length === 0}>
            {loading ? 'Removing...' : 'Remove master password'}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface ChangeViewProps {
  policy: PasswordPolicy | undefined;
  onDone: () => void;
  onCancel: () => void;
}

function ChangeView({ policy, onDone, onCancel }: ChangeViewProps) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const violation = policy ? passwordRuleViolation(newPw, policy) : null;
    if (violation) {
      setError(describePasswordRuleViolation(violation));
      return;
    }

    if (newPw !== confirm) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await changeMasterPassword(current, newPw);
      if (result.success) {
        onDone();
      } else {
        setError(refusalMessage(result));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Change Master Password</h4>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="mp-current">Current Password</Label>
          <div className="relative">
            <Input
              id="mp-current"
              type={showPw ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current master password"
              className="pr-9"
              autoFocus
              required
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mp-new2">New Password</Label>
          <Input
            id="mp-new2"
            type={showPw ? 'text' : 'password'}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New master password"
            aria-describedby={policy ? 'mp-new2-rule' : undefined}
            required
          />
          {policy && (
            <p id="mp-new2-rule" className="text-xs text-muted-foreground">
              {describePasswordPolicy(policy)}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="mp-confirm2">Confirm New Password</Label>
          <Input
            id="mp-confirm2"
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Changing...' : 'Change Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface MigrationViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function MigrationView({ onDone, onCancel }: MigrationViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMigrate = async () => {
    setError(null);
    setLoading(true);
    try {
      const report = await invoke<VaultMigrationReport>('master_password_migrate_credentials');
      const migrated = report.api_keys_migrated;
      if (report.rows_skipped_undecryptable > 0) {
        toast.warning(`Re-encrypted ${migrated} saved keys`, {
          description: `${report.rows_skipped_undecryptable} could not be read and were left as they were. Save those keys again to protect them.`,
        });
      } else {
        toast.success(`Re-encrypted ${migrated} saved keys with your master password`);
      }
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Protect Saved Keys</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        This re-encrypts your saved provider API keys with your master password (Argon2id +
        HKDF-SHA256), after which they can only be used while unlocked. {MASTER_PASSWORD_SCOPE} Each
        key is read back before it replaces the old copy, and removing the master password later
        moves them back.
      </p>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => void handleMigrate()} disabled={loading}>
          {loading ? 'Re-encrypting...' : 'Re-encrypt keys'}
        </Button>
      </div>
    </div>
  );
}
