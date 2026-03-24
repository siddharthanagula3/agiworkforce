/**
 * Onboarding Wizard — single-step mode selection flow
 *
 * One screen: Cloud vs Local/BYOK mode selection with inline API key paste
 * and Ollama auto-detection. Replaces the previous 6-step wizard.
 *
 * Persisted via useSimpleModeStore (onboardingCompleted flag in ui.ts).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, HardDrive, X, CheckCircle2, ChevronRight, Key } from 'lucide-react';
import { useSimpleModeStore } from '../../stores/ui';
import { useAppModeStore } from '../../stores/appModeStore';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { OllamaClient } from '../../api/ollama';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  onComplete: () => void;
}

interface OllamaStatus {
  available: boolean;
  modelCount: number;
  checked: boolean;
}

// ---------------------------------------------------------------------------
// BYOK key prefix detection
// ---------------------------------------------------------------------------

interface DetectedProvider {
  name: string;
  secretKey: string;
}

function detectProvider(apiKey: string): DetectedProvider | null {
  const trimmed = apiKey.trim();
  if (trimmed.startsWith('sk-ant-')) {
    return { name: 'Anthropic', secretKey: 'anthropic_api_key' };
  }
  if (trimmed.startsWith('sk-')) {
    return { name: 'OpenAI', secretKey: 'openai_api_key' };
  }
  if (trimmed.startsWith('AIza')) {
    return { name: 'Google', secretKey: 'google_api_key' };
  }
  if (trimmed.startsWith('xai-')) {
    return { name: 'xAI', secretKey: 'xai_api_key' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main OnboardingWizard
// ---------------------------------------------------------------------------

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const completeOnboarding = useSimpleModeStore((s) => s.completeOnboarding);
  const setMode = useAppModeStore((s) => s.setMode);
  // Ollama detection
  const [ollama, setOllama] = useState<OllamaStatus>({
    available: false,
    modelCount: 0,
    checked: false,
  });

  // BYOK paste field
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const detected = apiKey.trim().length > 8 ? detectProvider(apiKey) : null;

  // Detect Ollama on mount
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
    onComplete();
  }, [completeOnboarding, onComplete]);

  const handleCloud = useCallback(() => {
    setMode('cloud');
    completeOnboarding();
    onComplete();
  }, [setMode, completeOnboarding, onComplete]);

  const handleLocal = useCallback(() => {
    setMode('local');
    completeOnboarding();
    onComplete();
  }, [setMode, completeOnboarding, onComplete]);

  const handleByokSubmit = useCallback(async () => {
    if (!detected || saving) return;
    setSaving(true);
    try {
      await invoke('secret_manager_set', {
        key: detected.secretKey,
        value: apiKey.trim(),
      });
    } catch {
      // Secret manager may not be available in dev — proceed anyway
    }
    setMode('local');
    completeOnboarding();
    onComplete();
  }, [detected, saving, apiKey, setMode, completeOnboarding, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-2xl shadow-2xl border border-border overflow-hidden">
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
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
                <img
                  src="/icon.png"
                  alt="AGI Workforce"
                  className="w-8 h-8"
                  onError={(e) => {
                    // Fallback: hide broken image and let gradient show through
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              How do you want to use AGI Workforce?
            </h2>
          </div>

          {/* Mode cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Cloud card */}
            <div className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5 bg-card">
              <div className="flex items-center gap-2 w-full">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Cloud className="w-5 h-5 text-blue-400" />
                </div>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  $20/mo
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Cloud</p>
                <p className="text-xs text-blue-400 font-medium">Recommended</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  All models included. Start chatting instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloud}
                className={cn(
                  'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-primary text-white hover:bg-primary/90',
                )}
              >
                Start Cloud
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Local / BYOK card */}
            <div className="flex flex-col items-start gap-3 rounded-xl border border-white/10 p-5 bg-card">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Local / BYOK</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  Use Ollama, LM Studio, or your own API keys.
                </p>
              </div>
              {/* Ollama status */}
              {ollama.checked && (
                <div className="w-full">
                  {ollama.available ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ollama running — {ollama.modelCount} model
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
                Start Local
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* BYOK paste field */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR paste an API key</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
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
            <p className="text-xs text-muted-foreground/60 mt-1.5 text-center">
              Auto-detects: Anthropic, OpenAI, Google, xAI
            </p>
          </div>

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
