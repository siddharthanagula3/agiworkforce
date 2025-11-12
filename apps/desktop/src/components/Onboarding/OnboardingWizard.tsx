import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../ui/Button';
import { CheckCircle2, Circle } from 'lucide-react';

interface OnboardingStep {
  id: number;
  stepId: string;
  stepName: string;
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  data: string | null;
  createdAt: number;
  updatedAt: number;
}

interface OnboardingStatus {
  completed: boolean;
  progressPercent: number;
  totalSteps: number;
  completedSteps: number;
  steps: OnboardingStep[];
}

interface OnboardingWizardProps {
  onComplete: () => void;
}

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const result = await invoke<OnboardingStatus>('get_onboarding_status');
      setStatus(result);

      // Find first incomplete step
      const firstIncomplete = result.steps.findIndex((s) => !s.completed && !s.skipped);
      if (firstIncomplete >= 0) {
        setCurrentStepIndex(firstIncomplete);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load onboarding status:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const completeStep = useCallback(
    async (stepId: string, data?: string) => {
      try {
        await invoke('complete_onboarding_step', { stepId, data: data || null });
        await loadStatus();

        if (status && currentStepIndex < status.steps.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1);
        } else if (status?.completed) {
          onComplete();
        }
      } catch (error) {
        console.error('Failed to complete step:', error);
      }
    },
    [currentStepIndex, loadStatus, onComplete, status],
  );

  const skipStep = useCallback(
    async (stepId: string) => {
      try {
        await invoke('skip_onboarding_step', { stepId });
        await loadStatus();

        if (status && currentStepIndex < status.steps.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1);
        } else {
          onComplete();
        }
      } catch (error) {
        console.error('Failed to skip step:', error);
      }
    },
    [currentStepIndex, loadStatus, onComplete, status],
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!status || status.completed) {
    onComplete();
    return null;
  }

  const currentStep = status.steps[currentStepIndex];

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-4">
        <h1 className="text-2xl font-bold">Welcome to AGI Workforce</h1>
        <p className="text-muted-foreground">Let's get you started in just a few steps</p>
      </div>

      {/* Progress bar */}
      <div className="border-b border-border bg-card px-8 py-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStepIndex + 1} of {status.totalSteps}
          </span>
          <span className="text-muted-foreground">
            {Math.round(status.progressPercent)}% complete
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${status.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r border-border bg-card p-6">
          <div className="space-y-2">
            {status.steps.map((step, index) => (
              <button
                key={step.stepId}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  index === currentStepIndex
                    ? 'bg-primary/10 text-primary'
                    : step.completed || step.skipped
                      ? 'text-muted-foreground hover:bg-secondary'
                      : 'text-foreground hover:bg-secondary'
                }`}
                onClick={() => setCurrentStepIndex(index)}
              >
                {step.completed || step.skipped ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0" />
                )}
                <span className="truncate text-sm font-medium">{step.stepName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            {currentStep && currentStep.stepId === 'welcome' && (
              <WelcomeStep onNext={() => void completeStep(currentStep.stepId)} />
            )}
            {currentStep && currentStep.stepId === 'api_keys' && (
              <ApiKeysStep
                onNext={() => void completeStep(currentStep.stepId)}
                onSkip={() => void skipStep(currentStep.stepId)}
              />
            )}
            {currentStep && currentStep.stepId === 'first_task' && (
              <FirstTaskStep
                onNext={() => void completeStep(currentStep.stepId)}
                onSkip={() => void skipStep(currentStep.stepId)}
              />
            )}
            {currentStep && currentStep.stepId === 'explore_features' && (
              <ExploreStep onNext={() => void completeStep(currentStep.stepId)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const WelcomeStep = ({ onNext }: { onNext: () => void }) => (
  <div className="space-y-6">
    <div>
      <h2 className="mb-2 text-3xl font-bold">Welcome to AGI Workforce</h2>
      <p className="text-lg text-muted-foreground">Your AI-powered desktop automation assistant</p>
    </div>

    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-2 text-xl font-semibold">What can AGI Workforce do?</h3>
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
            <span>Automate repetitive desktop tasks</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
            <span>Control browsers and applications</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
            <span>Process documents and data</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
            <span>Integrate with APIs and databases</span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-2 text-xl font-semibold">Privacy First</h3>
        <p className="text-muted-foreground">
          Your data stays on your device. We use local models when possible and give you full
          control over which AI providers to use.
        </p>
      </div>
    </div>

    <div className="flex justify-end">
      <Button size="lg" onClick={onNext}>
        Get Started
      </Button>
    </div>
  </div>
);

const ApiKeysStep = ({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) => (
  <div className="space-y-6">
    <div>
      <h2 className="mb-2 text-3xl font-bold">Configure AI Providers</h2>
      <p className="text-lg text-muted-foreground">
        Add your API keys to enable AI-powered automation
      </p>
    </div>

    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
      <p className="text-sm text-yellow-600 dark:text-yellow-400">
        <strong>Note:</strong> You can configure this later in Settings if you don't have API keys
        ready.
      </p>
    </div>

    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-xl font-semibold">Supported Providers</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">OpenAI</p>
              <p className="text-sm text-muted-foreground">GPT-4, GPT-3.5</p>
            </div>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Anthropic</p>
              <p className="text-sm text-muted-foreground">Claude 3.5 Sonnet</p>
            </div>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Google</p>
              <p className="text-sm text-muted-foreground">Gemini 1.5 Pro</p>
            </div>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Ollama (Local)</p>
              <p className="text-sm text-muted-foreground">Free, runs on your computer</p>
            </div>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div className="flex justify-between">
      <Button variant="outline" onClick={onSkip}>
        Skip for Now
      </Button>
      <Button onClick={onNext}>Continue</Button>
    </div>
  </div>
);

const FirstTaskStep = ({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) => (
  <div className="space-y-6">
    <div>
      <h2 className="mb-2 text-3xl font-bold">Create Your First Task</h2>
      <p className="text-lg text-muted-foreground">
        Try creating a simple automation to see how it works
      </p>
    </div>

    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-xl font-semibold">Example Tasks</h3>
        <div className="space-y-3">
          <button className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-accent">
            <p className="font-medium">Open a website and take a screenshot</p>
            <p className="text-sm text-muted-foreground">Navigate to a URL and capture the page</p>
          </button>
          <button className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-accent">
            <p className="font-medium">Extract text from an image</p>
            <p className="text-sm text-muted-foreground">Use OCR to read text from screenshots</p>
          </button>
          <button className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-accent">
            <p className="font-medium">Search files on your computer</p>
            <p className="text-sm text-muted-foreground">Find files by name or content</p>
          </button>
        </div>
      </div>
    </div>

    <div className="flex justify-between">
      <Button variant="outline" onClick={onSkip}>
        Skip Tutorial
      </Button>
      <Button onClick={onNext}>Continue</Button>
    </div>
  </div>
);

const ExploreStep = ({ onNext }: { onNext: () => void }) => (
  <div className="space-y-6">
    <div>
      <h2 className="mb-2 text-3xl font-bold">You're All Set!</h2>
      <p className="text-lg text-muted-foreground">
        Here are some tips to help you get the most out of AGI Workforce
      </p>
    </div>

    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-2 text-lg font-semibold">Keyboard Shortcuts</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center justify-between">
            <span>Open command palette</span>
            <kbd className="rounded bg-secondary px-2 py-1 text-xs font-semibold">Ctrl+K</kbd>
          </li>
          <li className="flex items-center justify-between">
            <span>New conversation</span>
            <kbd className="rounded bg-secondary px-2 py-1 text-xs font-semibold">Ctrl+N</kbd>
          </li>
          <li className="flex items-center justify-between">
            <span>Toggle theme</span>
            <kbd className="rounded bg-secondary px-2 py-1 text-xs font-semibold">Ctrl+Shift+L</kbd>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-2 text-lg font-semibold">Helpful Resources</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <a href="#" className="text-primary hover:underline">
              Documentation
            </a>{' '}
            - Learn about all features
          </li>
          <li>
            <a href="#" className="text-primary hover:underline">
              Community Discord
            </a>{' '}
            - Get help from other users
          </li>
          <li>
            <a href="#" className="text-primary hover:underline">
              GitHub Issues
            </a>{' '}
            - Report bugs or request features
          </li>
        </ul>
      </div>
    </div>

    <div className="flex justify-end">
      <Button size="lg" onClick={onNext}>
        Start Using AGI Workforce
      </Button>
    </div>
  </div>
);
