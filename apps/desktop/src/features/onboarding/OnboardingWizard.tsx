import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, HardDrive, X, CheckCircle2, ChevronRight, Key } from 'lucide-react';
import { useSimpleModeStore } from '../../stores/ui';
import { useAppModeStore } from '../../stores/appModeStore';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { OllamaClient } from '../../api/ollama';

interface OnboardingWizardProps {
  onComplete: () => void;
  onCloudModeSelected?: () => void;
  onByokModeSelected?: () => void;
}

interface OllamaStatus {
  available: boolean;
  modelCount: number;
  checked: boolean;
}

interface DetectedProvider {
  name: string;
  providerId: string;
}

function detectProvider(apiKey: string): DetectedProvider | null {
  const trimmed = apiKey.trim();

  if (trimmed.startsWith('sk-ant-')) {
    return { name: 'Anthropic', providerId: 'anthropic' };
  }
  if (trimmed.startsWith('AIza')) {
    return { name: 'Google', providerId: 'google' };
  }
  if (trimmed.startsWith('xai-')) {
    return { name: 'xAI', providerId: 'xai' };
  }
  if (trimmed.startsWith('pplx-')) {
    return { name: 'Perplexity', providerId: 'perplexity' };
  }
  if (trimmed.startsWith('sk-or-')) {
    return { name: 'OpenRouter', providerId: 'open_router' };
  }
  if (trimmed.startsWith('sk-')) {
    return { name: 'OpenAI', providerId: 'openai' };
  }
  return null;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onCloudModeSelected,
  onByokModeSelected,
}) => {
  const completeOnboarding = useSimpleModeStore((s) => s.completeOnboarding);
  const setMode = useAppModeStore((s) => s.setMode);
  const setHasSelectedMode = useAppModeStore((s) => s.setHasSelectedMode);
  const [ollama, setOllama] = useState<OllamaStatus>({
    available: false,
    modelCount: 0,
    checked: false,
  });

  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const detected = apiKey.trim().length > 8 ? detectProvider(apiKey) : null;

  useEffect(() => {
    let cancelled = false;
    OllamaClient.isReadyForUse()
      .then((result) => {
        if (!cancelled) {
          setOllama({
            available: result.available,
            modelCount: result.modelCount,
            checked: true,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOllama({ available: false, modelCount: 0, checked: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFinish = useCallback(() => {
    completeOnboarding();
    setHasSelectedMode(true);
    onComplete();
  }, [completeOnboarding, setHasSelectedMode, onComplete]);

  const handleCloudMode = useCallback(() => {
    completeOnboarding();
    setHasSelectedMode(true);
    onComplete();
    onCloudModeSelected?.();
  }, [completeOnboarding, setHasSelectedMode, onComplete, onCloudModeSelected]);

  const handleLocal = useCallback(() => {
    setMode('local');
    completeOnboarding();
    setHasSelectedMode(true);
    onComplete();
  }, [setMode, completeOnboarding, setHasSelectedMode, onComplete]);

  const handleByokSubmit = useCallback(async () => {
    if (!detected || saving) return;
    setSaving(true);
    setSecretError(null);
    try {
      await invoke('save_api_key', {
        provider: detected.providerId,
        key: apiKey.trim(),
      });
    } catch (error) {
      setSecretError(
        error instanceof Error ? error.message : 'Could not save this API key securely.',
      );
      setSaving(false);
      return;
    }
    setMode('local');
    completeOnboarding();
    setHasSelectedMode(true);
    onComplete();
  }, [detected, saving, apiKey, setMode, completeOnboarding, setHasSelectedMode, onComplete]);

  const handleByokSetup = useCallback(() => {
    if (detected) {
      void handleByokSubmit();
      return;
    }

    setMode('local');
    completeOnboarding();
    setHasSelectedMode(true);
    onComplete();
    onByokModeSelected?.();
  }, [
    detected,
    handleByokSubmit,
    setMode,
    completeOnboarding,
    setHasSelectedMode,
    onComplete,
    onByokModeSelected,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 max-h-[calc(100vh-48px)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl">
        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleFinish}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
          aria-label="Skip onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pt-8">
          {/* Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="flex justify-center">
              <div
                className="w-14 h-14 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-lg"
                aria-label="AGI"
              >
                <span className="text-sm font-semibold">AGI</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground">How do you want to use AGI?</h2>
            <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
              Pick the trust boundary first. You can change this later, but AGI will never move a
              Local chat into BYOK or Cloud without an explicit handoff.
            </p>
          </div>

          {/* Mode cards */}
          <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
            {/* Local card */}
            <div className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5 bg-card">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Local Mode</p>
                <p className="text-xs text-amber-300 font-medium">Stored on this device</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  Use local models such as Ollama or LM Studio. Chats, files, and settings stay on
                  your Mac unless you explicitly export or hand off.
                </p>
              </div>
              {ollama.checked && (
                <div className="w-full">
                  {ollama.available ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ollama running, {ollama.modelCount} model
                      {ollama.modelCount !== 1 ? 's' : ''}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Ollama not detected</p>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleLocal}
                className={cn(
                  'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
                )}
              >
                Start Local Mode
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* BYOK card */}
            <div className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5 bg-card">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">BYOK</p>
                <p className="text-xs text-emerald-300 font-medium">Your provider key</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  Keep AGI storage local while sending selected requests directly to your OpenAI,
                  Anthropic, Google, or compatible provider account.
                </p>
              </div>
              <button
                type="button"
                onClick={handleByokSetup}
                className={cn(
                  'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
                )}
              >
                {detected ? `Save ${detected.name} key` : 'Configure BYOK'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Managed cloud card */}
            <div className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5 bg-card">
              <div className="flex items-center gap-2 w-full">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Cloud className="w-5 h-5 text-blue-400" />
                </div>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 font-medium">
                  Account
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Cloud Mode</p>
                <p className="text-xs text-blue-400 font-medium">Public alpha, available now</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  AGI Cloud (subscriptions, hosted storage, synced chats) is in public alpha. Sign
                  in to sync your chats across desktop, web, and mobile, or continue with Local or
                  BYOK, which stay on your device.
                </p>
              </div>
              {/*
                This card's action enters the Cloud workspace (the host wires
                `onCloudModeSelected` to `setMode('cloud')`, which renders the
                device sign-in screen). It was labelled "Continue with Local for
                now", which described the opposite of what it does, the Local
                card and "Skip for now" are the ways to stay local.
              */}
              <button
                type="button"
                data-testid="onboarding-cloud-mode"
                onClick={handleCloudMode}
                className={cn(
                  'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-primary text-white hover:bg-primary/90',
                )}
              >
                Sign in to AGI Cloud
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* BYOK paste field */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                OR paste an API key for Local Mode + BYOK
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="relative">
              <Key
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50"
                aria-hidden="true"
              />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && detected) {
                    void handleByokSubmit();
                  }
                }}
                placeholder="Paste any API key here..."
                aria-label="API key"
                aria-describedby="byok-providers-hint"
                className={cn(
                  'w-full pl-9 pr-28 py-2.5 rounded-xl border bg-card text-sm text-foreground placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
                  'border-border',
                )}
                autoComplete="off"
                spellCheck={false}
              />
              {detected && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {detected.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleByokSubmit()}
                    disabled={saving}
                    className="px-2.5 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Go'}
                  </button>
                </div>
              )}
            </div>
            {secretError && (
              <p className="text-xs text-red-400 mt-1.5 text-center" role="alert">
                {secretError}
              </p>
            )}
            <p
              id="byok-providers-hint"
              className="text-xs text-muted-foreground/60 mt-1.5 text-center"
            >
              Auto-detects: Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot,
              Zhipu
            </p>
          </div>

          {/* Cross-mode transfer note */}
          <p className="text-[11px] text-muted-foreground/70 text-center mb-3">
            Local chats stay local. Continuing with BYOK creates a consented fork with a preview.
          </p>

          {/* Skip link */}
          <div className="text-center">
            <button
              type="button"
              onClick={handleFinish}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3 inline-block mr-1 -mt-0.5" />
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
