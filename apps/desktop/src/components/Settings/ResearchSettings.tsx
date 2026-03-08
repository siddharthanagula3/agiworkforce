/**
 * ResearchSettings
 *
 * Settings section for the Deep Research module.
 * - Perplexity API key (stored via SecretManager — never in plaintext)
 * - Research mode: quick / standard / deep / comprehensive
 * - Max sources slider (1-20)
 *
 * Persists via the Rust SecretManager (`secret_manager_set`)
 * and a plain user-preference key (`set_user_preference`).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle, FlaskConical } from 'lucide-react';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';

type ResearchMode = 'quick' | 'standard' | 'deep' | 'comprehensive';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const RESEARCH_MODES: { value: ResearchMode; label: string; description: string }[] = [
  {
    value: 'quick',
    label: 'Quick',
    description: 'Fast lookup from a handful of top sources',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Balanced depth — good for most research tasks',
  },
  {
    value: 'deep',
    label: 'Deep',
    description: 'Thorough multi-source research with cross-referencing',
  },
  {
    value: 'comprehensive',
    label: 'Comprehensive',
    description: 'Exhaustive investigation — may take several minutes',
  },
];

interface ResearchPrefs {
  mode: ResearchMode;
  maxSources: number;
  perplexityKeySet: boolean;
}

async function loadResearchPrefs(): Promise<ResearchPrefs> {
  const [modeResult, sourcesResult, keyResult] = await Promise.allSettled([
    invoke<{ value: string } | null>('get_user_preference', { key: 'research_mode' }),
    invoke<{ value: string } | null>('get_user_preference', { key: 'research_max_sources' }),
    invoke<boolean>('secret_manager_has', { key: 'perplexity_api_key' }),
  ]);

  const mode: ResearchMode =
    modeResult.status === 'fulfilled' && modeResult.value?.value
      ? (modeResult.value.value as ResearchMode)
      : 'standard';

  const maxSources: number =
    sourcesResult.status === 'fulfilled' && sourcesResult.value?.value
      ? Number(sourcesResult.value.value)
      : 10;

  const perplexityKeySet: boolean =
    keyResult.status === 'fulfilled' ? keyResult.value : false;

  return { mode, maxSources, perplexityKeySet };
}

export function ResearchSettings() {
  const [prefs, setPrefs] = useState<ResearchPrefs>({
    mode: 'standard',
    maxSources: 10,
    perplexityKeySet: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Perplexity key input state
  const [keyInput, setKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<SaveStatus>('idle');
  const [keyError, setKeyError] = useState<string>('');

  // Pref save status
  const [prefStatus, setPrefStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadResearchPrefs()
      .then((p) => {
        if (mounted) {
          setPrefs(p);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(getSimpleErrorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveKey = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyStatus('saving');
    setKeyError('');
    try {
      await invoke('secret_manager_set', { key: 'perplexity_api_key', value: trimmed });
      setKeyInput('');
      setKeyStatus('saved');
      setPrefs((p) => ({ ...p, perplexityKeySet: true }));
      setTimeout(() => setKeyStatus('idle'), 2500);
    } catch (err) {
      setKeyStatus('error');
      setKeyError(getSimpleErrorMessage(err));
    }
  }, [keyInput]);

  const handleRemoveKey = useCallback(async () => {
    setKeyStatus('saving');
    setKeyError('');
    try {
      await invoke('secret_manager_delete', { key: 'perplexity_api_key' });
      setKeyStatus('idle');
      setPrefs((p) => ({ ...p, perplexityKeySet: false }));
    } catch (err) {
      setKeyStatus('error');
      setKeyError(getSimpleErrorMessage(err));
    }
  }, []);

  const savePrefs = useCallback(async (updated: Partial<ResearchPrefs>) => {
    const next = { ...prefs, ...updated };
    setPrefs(next);
    setPrefStatus('saving');
    try {
      await Promise.all([
        invoke('set_user_preference', { key: 'research_mode', value: next.mode }),
        invoke('set_user_preference', {
          key: 'research_max_sources',
          value: String(next.maxSources),
        }),
      ]);
      setPrefStatus('saved');
      setTimeout(() => setPrefStatus('idle'), 2000);
    } catch (err) {
      setPrefStatus('error');
      console.error('[ResearchSettings] Failed to save prefs:', err);
    }
  }, [prefs]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading research settings…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Failed to load research settings: {loadError}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Deep Research</h3>
          <p className="text-sm text-muted-foreground">
            Configure multi-source research powered by Perplexity AI
          </p>
        </div>
      </div>

      {/* Perplexity API Key */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-0.5">Perplexity API Key</h4>
          <p className="text-xs text-muted-foreground">
            Required to use web-grounded research. Keys are encrypted via SecretManager (Argon2id + AES-GCM) and never stored in plaintext.
          </p>
        </div>

        {prefs.perplexityKeySet ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              <span className="font-medium">API key is saved</span>
            </div>
            <button
              type="button"
              onClick={() => void handleRemoveKey()}
              disabled={keyStatus === 'saving'}
              className="text-xs text-destructive underline hover:no-underline disabled:opacity-50"
            >
              Remove key
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveKey();
                }}
                placeholder="pplx-…"
                autoComplete="off"
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => void handleSaveKey()}
                disabled={!keyInput.trim() || keyStatus === 'saving'}
                className="shrink-0 h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {keyStatus === 'saving' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
            {keyError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {keyError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Get your key at{' '}
              <a
                href="https://www.perplexity.ai/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                perplexity.ai/settings/api
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Research Mode */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Research Mode</Label>
          {prefStatus === 'saving' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {prefStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
        <Select
          value={prefs.mode}
          onValueChange={(val) => void savePrefs({ mode: val as ResearchMode })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <span className="font-medium">{m.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{m.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {RESEARCH_MODES.find((m) => m.value === prefs.mode)?.description}
        </p>
      </div>

      {/* Max Sources */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Max Sources
            <span className="ml-2 font-normal text-muted-foreground">{prefs.maxSources}</span>
          </Label>
        </div>
        <Slider
          min={1}
          max={20}
          step={1}
          value={[prefs.maxSources]}
          onValueChange={([val]) => {
            if (val !== undefined) {
              setPrefs((p) => ({ ...p, maxSources: val }));
            }
          }}
          onValueCommit={([val]) => {
            if (val !== undefined) {
              void savePrefs({ maxSources: val });
            }
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 (fastest)</span>
          <span>20 (most thorough)</span>
        </div>
      </div>

      {/* Citation toggle — stored via user pref */}
      <CitationToggle />
    </div>
  );
}

function CitationToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<{ value: string } | null>('get_user_preference', { key: 'research_citations' })
      .then((r) => {
        if (r?.value !== undefined) {
          setEnabled(r.value !== 'false');
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggle = useCallback(async (val: boolean) => {
    setEnabled(val);
    try {
      await invoke('set_user_preference', {
        key: 'research_citations',
        value: String(val),
      });
    } catch (err) {
      console.error('[ResearchSettings] Failed to save citations preference:', err);
    }
  }, []);

  if (!loaded) return null;

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">Show Citations</Label>
        <p className="text-xs text-muted-foreground">
          Include numbered source references in research reports
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={(v) => void toggle(v)} />
    </div>
  );
}
