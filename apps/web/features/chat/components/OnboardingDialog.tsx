'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@shared/ui/dialog';
import { Button } from '@shared/ui/button';
import { Bot, Key, Sparkles, ArrowRight, Check, Globe, Shield, Monitor } from 'lucide-react';
import { cn } from '@shared/lib/utils';

const ONBOARDING_KEY = 'agi-onboarding-completed';
const TOTAL_STEPS = 3;

// ---- localStorage helpers ------------------------------------------------

export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ONBOARDING_KEY) !== 'true';
}

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export function resetOnboardingFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ONBOARDING_KEY);
}

// ---- Step 1: Welcome -------------------------------------------------------

const BENEFITS = [
  {
    icon: Globe,
    label: 'Multi-model',
    description: 'Connect OpenAI, Anthropic, Google, or run models locally with Ollama.',
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    icon: Shield,
    label: 'Privacy-first',
    description: 'Your keys, your data. No API calls leave your device without your consent.',
    color: 'text-teal-500 bg-teal-500/10',
  },
  {
    icon: Monitor,
    label: 'Desktop automation',
    description: 'Control apps, browse the web, and run scripts — all from one chat interface.',
    color: 'text-purple-500 bg-purple-500/10',
  },
];

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-600/20 border border-teal-500/20">
          <Sparkles className="h-8 w-8 text-teal-500" />
        </div>
        <DialogTitle className="text-2xl font-bold">Welcome to AGI Workforce</DialogTitle>
        <DialogDescription className="text-sm mt-1">
          Your AI desktop assistant that works with any model
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        {BENEFITS.map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
          >
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                item.color,
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
        Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---- Step 2: Connect a Provider --------------------------------------------

interface Provider {
  id: string;
  name: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  free?: boolean;
}

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-5.4, o3, and more',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Opus 4.6, Claude Sonnet 4.6',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini 3.1 Pro, Gemini 3.1 Flash Lite',
    keyLabel: 'Google AI API Key',
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'free',
    name: 'Use Free Tier',
    description: 'Start chatting right away — no key needed',
    keyLabel: '',
    keyPlaceholder: '',
    free: true,
  },
];

function StepProvider({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');

  const selectedProvider = PROVIDERS.find((p) => p.id === selectedId);
  const canProceed = selectedId === 'free' || (selectedId !== null && apiKey.trim().length > 0);

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setApiKey('');
  }

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20">
          <Key className="h-6 w-6 text-teal-500" />
        </div>
        <DialogTitle className="text-xl font-bold">Connect a Provider</DialogTitle>
        <DialogDescription className="text-sm mt-1">
          Pick an AI provider or use the free tier to get started instantly.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        {PROVIDERS.map((provider) => {
          const isSelected = selectedId === provider.id;
          return (
            <button
              key={provider.id}
              onClick={() => handleSelect(provider.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
                isSelected
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                  isSelected ? 'border-teal-500/40 bg-teal-500/20' : 'border-border/40 bg-muted/30',
                )}
              >
                {isSelected ? (
                  <Check className="h-4 w-4 text-teal-500" />
                ) : provider.free ? (
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Bot className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{provider.name}</span>
                <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedProvider && !selectedProvider.free && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="onboarding-api-key" className="text-xs font-medium text-foreground">
            {selectedProvider.keyLabel}
          </label>
          <input
            id="onboarding-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={selectedProvider.keyPlaceholder}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground">
            Stored locally in your browser. Never sent to our servers.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={onSkip} className="w-full text-muted-foreground">
          Skip for now
        </Button>
      </div>
    </div>
  );
}

// ---- Step 3: Try Your First Chat -------------------------------------------

const SUGGESTED_PROMPTS = [
  {
    title: 'Explain a concept',
    text: 'Explain quantum computing simply',
  },
  {
    title: 'Write a script',
    text: 'Write a Python script to organize my files',
  },
  {
    title: 'Analyze a topic',
    text: 'Analyze the pros and cons of remote work',
  },
  {
    title: 'Draft content',
    text: 'Help me draft a professional email',
  },
];

interface StepFirstChatProps {
  onPromptSelect: (text: string) => void;
  onFinish: () => void;
}

function StepFirstChat({ onPromptSelect, onFinish }: StepFirstChatProps) {
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20">
          <Bot className="h-6 w-6 text-teal-500" />
        </div>
        <DialogTitle className="text-xl font-bold">Try Your First Chat</DialogTitle>
        <DialogDescription className="text-sm mt-1">
          Pick a prompt to get started, or just start chatting.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt.text}
            onClick={() => onPromptSelect(prompt.text)}
            className="rounded-xl border border-border/60 bg-muted/30 p-3 text-left text-sm hover:bg-muted/60 hover:border-teal-500/40 transition-colors"
          >
            <div className="font-medium text-foreground text-xs">{prompt.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {prompt.text}
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onFinish} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
        Start Chatting
        <Sparkles className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---- Step indicator --------------------------------------------------------

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-200',
            i === current - 1 ? 'w-5 bg-teal-500' : 'w-1.5 bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

// ---- Main component --------------------------------------------------------

export interface OnboardingDialogProps {
  /**
   * Called when the user selects a suggested prompt on step 3.
   * The dialog closes and the prompt is passed to the caller.
   */
  onPromptSelect?: (text: string) => void;
  /**
   * Called when the user finishes or dismisses the dialog.
   */
  onComplete?: () => void;
}

export function OnboardingDialog({ onPromptSelect, onComplete }: OnboardingDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (shouldShowOnboarding()) {
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const close = useCallback(() => {
    markOnboardingComplete();
    setOpen(false);
    onComplete?.();
  }, [onComplete]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close],
  );

  const handleNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const handlePromptSelect = useCallback(
    (text: string) => {
      markOnboardingComplete();
      setOpen(false);
      onPromptSelect?.(text);
      onComplete?.();
    },
    [onPromptSelect, onComplete],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton={step < TOTAL_STEPS}
        aria-describedby="onboarding-description"
      >
        {/* Teal accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-lg bg-gradient-to-r from-teal-500 to-emerald-500" />

        <div className="pt-2">
          {step === 1 && <StepWelcome onNext={handleNext} />}
          {step === 2 && <StepProvider onNext={handleNext} onSkip={handleNext} />}
          {step === 3 && <StepFirstChat onPromptSelect={handlePromptSelect} onFinish={close} />}
        </div>

        <StepDots current={step} total={TOTAL_STEPS} />

        {/* Hidden description for screen readers */}
        <span id="onboarding-description" className="sr-only">
          Onboarding wizard, step {step} of {TOTAL_STEPS}
        </span>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingDialog;
