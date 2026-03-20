import { invoke } from '@/lib/tauri-mock';
import { Eye, EyeOff, KeyRound, Lock, LockOpen, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

interface MasterPasswordStatus {
  is_configured: boolean;
  is_unlocked: boolean;
  last_changed: string | null;
  needs_migration: boolean;
}

type View = 'status' | 'setup' | 'unlock' | 'change' | 'migration';

const MIN_PASSWORD_LENGTH = 8;

export function MasterPasswordSettings() {
  const [status, setStatus] = useState<MasterPasswordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('status');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await invoke<MasterPasswordStatus>('master_password_get_status');
      setStatus(s);
    } catch (err) {
      console.error('Failed to load master password status:', err);
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

  if (view === 'setup') {
    return <SetupView onDone={handleDone} onCancel={() => setView('status')} />;
  }

  if (view === 'unlock') {
    return <UnlockView onDone={handleDone} onCancel={() => setView('status')} />;
  }

  if (view === 'change') {
    return <ChangeView onDone={handleDone} onCancel={() => setView('status')} />;
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
          await invoke('master_password_lock');
          await loadStatus();
        } catch (err) {
          console.error('Failed to lock master password:', err);
          toast.error('Lock failed', {
            description: 'Failed to lock. Please try again.',
          });
        }
      }}
      onChange={() => setView('change')}
      onMigrate={() => setView('migration')}
    />
  );
}

// ── Status View ─────────────────────────────────────────────────────────────

interface StatusViewProps {
  status: MasterPasswordStatus | null;
  onSetup: () => void;
  onUnlock: () => void;
  onLock: () => void;
  onChange: () => void;
  onMigrate: () => void;
}

function StatusView({ status, onSetup, onUnlock, onLock, onChange, onMigrate }: StatusViewProps) {
  const isConfigured = status?.is_configured ?? false;
  const isUnlocked = status?.is_unlocked ?? false;
  const needsMigration = status?.needs_migration ?? false;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-full p-2 ${isConfigured ? (isUnlocked ? 'bg-green-500/10' : 'bg-orange-500/10') : 'bg-muted'}`}
          >
            {isConfigured ? (
              isUnlocked ? (
                <LockOpen className="h-4 w-4 text-green-500" />
              ) : (
                <Lock className="h-4 w-4 text-orange-500" />
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
        </div>
      </div>

      {!isConfigured && (
        <p className="text-xs text-muted-foreground">
          Set a master password to add an extra layer of protection. Your API keys and secrets will
          be encrypted using Argon2id (OWASP-recommended).
        </p>
      )}

      {needsMigration && isUnlocked && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
              Migration available
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Re-encrypt your secrets with your master password for stronger protection.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={onMigrate}>
            Migrate
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Setup View ───────────────────────────────────────────────────────────────

interface SetupViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function SetupView({ onDone, onCancel }: SetupViewProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>('master_password_setup', {
        password,
      });
      if (result.success) {
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
        <Shield className="h-5 w-5 text-foreground" />
        <h4 className="font-semibold">Set Up Master Password</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose a strong password (minimum 8 characters). This encrypts your API keys and secrets
        using Argon2id with OWASP-recommended parameters.
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
              placeholder="At least 8 characters"
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

        {error && <p className="text-xs text-destructive">{error}</p>}

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

// ── Unlock View ──────────────────────────────────────────────────────────────

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
      const result = await invoke<{ success: boolean; message: string }>('master_password_unlock', {
        password,
      });
      if (result.success) {
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

// ── Change View ──────────────────────────────────────────────────────────────

interface ChangeViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function ChangeView({ onDone, onCancel }: ChangeViewProps) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPw.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    if (newPw !== confirm) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>('master_password_change', {
        currentPassword: current,
        newPassword: newPw,
      });
      if (result.success) {
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
            placeholder="At least 8 characters"
            required
          />
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

        {error && <p className="text-xs text-destructive">{error}</p>}

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

// ── Migration View ───────────────────────────────────────────────────────────

interface MigrationViewProps {
  onDone: () => void;
  onCancel: () => void;
}

function MigrationView({ onDone, onCancel }: MigrationViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationConfirmed, setMigrationConfirmed] = useState(false);

  const handleMigrate = async () => {
    setError(null);
    setLoading(true);
    try {
      await invoke('master_password_start_migration');
      await invoke('master_password_complete_migration');
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
        <h4 className="font-semibold">Migrate Secrets</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        This will re-encrypt all stored API keys and secrets using your master password (Argon2id +
        HKDF-SHA256). The app must be unlocked before migration. This cannot be undone.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={migrationConfirmed}
          onChange={(e) => setMigrationConfirmed(e.target.checked)}
          className="rounded"
        />
        I understand this cannot be undone and I have backed up my API keys
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => void handleMigrate()} disabled={loading || !migrationConfirmed}>
          {loading ? 'Migrating...' : 'Start Migration'}
        </Button>
      </div>
    </div>
  );
}
