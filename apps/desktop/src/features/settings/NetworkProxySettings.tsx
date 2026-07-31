import { open } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, Network, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { invoke } from '@/lib/tauri-mock';
import { useSettingsStore } from '@/stores/settingsStore';

interface NetworkProxySettingsValue {
  enabled: boolean;
  proxyUrl: string;
  noProxy: string;
  caCertPath: string;
  username: string;
  hasPassword: boolean;
}

interface NetworkProxyUpdate extends Omit<NetworkProxySettingsValue, 'hasPassword'> {
  password: string | null;
  clearPassword: boolean;
}

const EMPTY_SETTINGS: NetworkProxySettingsValue = {
  enabled: false,
  proxyUrl: '',
  noProxy: 'localhost,127.0.0.1,::1',
  caCertPath: '',
  username: '',
  hasPassword: false,
};

function validateProxyUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Enter a valid proxy URL, including http:// or https://.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only HTTP and HTTPS proxy URLs are supported.';
  }
  if (parsed.username || parsed.password) {
    return 'Keep credentials out of the URL. Use the encrypted username and password fields.';
  }
  return null;
}

async function restoreLocalProviders(): Promise<string[]> {
  const { llmConfig } = useSettingsStore.getState();
  const providers = [
    ['ollama', llmConfig.ollamaUrl || 'http://localhost:11434'],
    ['lmstudio', llmConfig.lmstudioUrl || 'http://localhost:1234/v1'],
    ['llamacpp', llmConfig.llamacppUrl || 'http://localhost:8080/v1'],
    ['vllm', llmConfig.vllmUrl || 'http://localhost:8000/v1'],
  ] as const;

  const results = await Promise.allSettled(
    providers.map(([provider, baseUrl]) =>
      invoke('llm_configure_provider', { provider, apiKey: null, baseUrl }),
    ),
  );
  return results.flatMap((result, index) =>
    result.status === 'rejected' ? [providers[index]?.[0] ?? 'local provider'] : [],
  );
}

/**
 * Native-only, immediately-applied LLM network settings. The password never
 * enters the Zustand settings store or localStorage; the backend returns only
 * whether encrypted native storage already contains one.
 */
export function NetworkProxySettings() {
  const [value, setValue] = useState<NetworkProxySettingsValue>(EMPTY_SETTINGS);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await invoke<NetworkProxySettingsValue>('llm_network_proxy_get');
      setValue(settings);
      setPassword('');
      setClearPassword(false);
      setSaved(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validationError = useMemo(() => {
    if (value.enabled && !value.proxyUrl.trim()) return 'A proxy URL is required when enabled.';
    if (value.enabled) return validateProxyUrl(value.proxyUrl.trim());
    return null;
  }, [value.enabled, value.proxyUrl]);

  const update = <K extends keyof NetworkProxySettingsValue>(
    key: K,
    next: NetworkProxySettingsValue[K],
  ) => {
    setValue((current) => ({ ...current, [key]: next }));
    setSaved(false);
    setError(null);
  };

  const chooseCertificate = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Choose a PEM root CA certificate',
        filters: [{ name: 'Certificates', extensions: ['pem', 'crt', 'cer'] }],
      });
      if (typeof selected === 'string') update('caCertPath', selected);
    } catch (dialogError) {
      setError(dialogError instanceof Error ? dialogError.message : String(dialogError));
    }
  };

  const save = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    const request: NetworkProxyUpdate = {
      enabled: value.enabled,
      proxyUrl: value.proxyUrl.trim(),
      noProxy: value.noProxy.trim(),
      caCertPath: value.caCertPath.trim(),
      username: value.username.trim(),
      password: password || null,
      clearPassword,
    };

    try {
      const updated = await invoke<NetworkProxySettingsValue>('llm_network_proxy_set', { request });
      setValue(updated);
      setPassword('');
      setClearPassword(false);
      setSaved(true);

      const failedProviders = await restoreLocalProviders();
      if (failedProviders.length > 0) {
        toast.warning('Proxy saved; some local providers could not be restored', {
          description: failedProviders.join(', '),
        });
      } else {
        toast.success('LLM network settings applied');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading encrypted network settings…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold">LLM network proxy</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Applies to Managed Cloud, BYOK, and local-model HTTP clients. When disabled, the app
            follows HTTP_PROXY, HTTPS_PROXY, and NO_PROXY from its environment.
          </p>
        </div>
        <Switch
          id="networkProxyEnabled"
          checked={value.enabled}
          onCheckedChange={(enabled) => update('enabled', enabled)}
          aria-label="Use a custom LLM network proxy"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="networkProxyUrl">Proxy URL</Label>
          <Input
            id="networkProxyUrl"
            type="url"
            value={value.proxyUrl}
            disabled={!value.enabled || saving}
            onChange={(event) => update('proxyUrl', event.target.value)}
            placeholder="https://proxy.example.com:8443"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">Credentials are stored separately below.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="networkProxyUsername">Username (optional)</Label>
          <Input
            id="networkProxyUsername"
            value={value.username}
            disabled={!value.enabled || saving}
            onChange={(event) => update('username', event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="networkProxyPassword">Password (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="networkProxyPassword"
              type={showPassword ? 'text' : 'password'}
              value={password}
              disabled={!value.enabled || saving || clearPassword}
              onChange={(event) => {
                setPassword(event.target.value);
                setSaved(false);
                setClearPassword(false);
              }}
              placeholder={value.hasPassword ? 'Saved securely — enter to replace' : ''}
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!value.enabled || saving}
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide proxy password' : 'Show proxy password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {value.hasPassword && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!value.enabled || saving}
              onClick={() => {
                setClearPassword((current) => !current);
                setPassword('');
                setSaved(false);
              }}
              className="h-auto px-0 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {clearPassword ? 'Password will be removed on apply' : 'Remove saved password'}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Passwords stay in encrypted native storage and are never returned to this screen.
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="networkProxyBypass">Bypass proxy for</Label>
          <Input
            id="networkProxyBypass"
            value={value.noProxy}
            disabled={!value.enabled || saving}
            onChange={(event) => update('noProxy', event.target.value)}
            placeholder="localhost,127.0.0.1,::1,.internal.example"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated hosts, domains, IP addresses, or CIDR ranges. Keep loopback entries for
            local model runtimes.
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="networkProxyCaPath">Custom root CA certificate (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="networkProxyCaPath"
              value={value.caCertPath}
              disabled={saving}
              onChange={(event) => update('caCertPath', event.target.value)}
              placeholder="/absolute/path/corporate-root-ca.pem"
              spellCheck={false}
            />
            <Button type="button" variant="outline" disabled={saving} onClick={chooseCertificate}>
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            PEM only. The CA is an additional trusted root and also applies with environment proxy
            settings.
          </p>
        </div>
      </div>

      {(error || validationError) && (
        <div className="flex items-start gap-2 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error || validationError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          {saved && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" /> Applied to live providers
            </>
          )}
        </span>
        <Button type="button" disabled={saving || Boolean(validationError)} onClick={save}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Apply network settings
        </Button>
      </div>
    </div>
  );
}
