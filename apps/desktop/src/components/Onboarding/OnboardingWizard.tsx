/**
 * Onboarding Wizard — 5-step first-run experience
 *
 * Step 1: Welcome    — AGI Workforce overview, key differentiators
 * Step 2: API Keys   — prompt to add a key or skip (BYOK / local LLM)
 * Step 3: Model      — pick a default model from top 5 recommendations
 * Step 4: Tour       — text-only highlights of chat, tools, workflows, settings
 * Step 5: Ready      — action buttons (Start Chat, Browse Skills, Open Settings)
 *
 * No heavy animations — clean step-by-step with Tailwind CSS transitions only.
 * Persisted via useSimpleModeStore (onboardingCompleted flag in ui.ts).
 */
import React, { useState } from 'react';
import {
  Sparkles,
  Key,
  Cpu,
  Map,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  MessageSquare,
  Zap,
  Shield,
  Smartphone,
  ExternalLink,
  Bot,
  Settings,
  Wand2,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { useSimpleModeStore } from '../../stores/ui';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { isCloudWeb } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  onComplete: () => void;
}

type StepId = 'mode' | 'welcome' | 'api-keys' | 'model' | 'tour' | 'ready';

interface Step {
  id: StepId;
  label: string;
  icon: React.ElementType;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const ALL_STEPS: Step[] = [
  { id: 'mode', label: 'Mode', icon: Shield },
  { id: 'welcome', label: 'Welcome', icon: Sparkles },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'model', label: 'Model', icon: Cpu },
  { id: 'tour', label: 'Tour', icon: Map },
  { id: 'ready', label: 'Ready', icon: CheckCircle2 },
];

// Web is cloud-only — skip mode selection and API keys steps
const WEB_HIDDEN_STEPS = new Set<StepId>(['mode', 'api-keys']);
const STEPS: Step[] = isCloudWeb ? ALL_STEPS.filter((s) => !WEB_HIDDEN_STEPS.has(s.id)) : ALL_STEPS;

// Top recommended models shown in the model-picker step
const ALL_RECOMMENDED_MODELS = [
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    description: 'Automatically routes to the best model for each task',
    badge: 'Smart',
    badgeColor: 'bg-primary/10 text-primary',
  },
  {
    id: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    description: 'Most capable — advanced reasoning, long documents',
    badge: 'Best',
    badgeColor: 'bg-purple-500/10 text-purple-400',
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    description: 'OpenAI flagship — great for coding and structured tasks',
    badge: 'Fast',
    badgeColor: 'bg-green-500/10 text-green-400',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    description: "Google's best — large context, multimodal",
    badge: 'Balanced',
    badgeColor: 'bg-blue-500/10 text-blue-400',
  },
  {
    id: 'ollama/llama3',
    label: 'Llama 3 (Local)',
    description: 'Runs locally on your machine — fully private, no API key needed',
    badge: 'Local',
    badgeColor: 'bg-amber-500/10 text-amber-400',
  },
];

// Web is cloud-only — hide local-only models
const RECOMMENDED_MODELS = isCloudWeb
  ? ALL_RECOMMENDED_MODELS.filter((m) => m.id !== 'ollama/llama3')
  : ALL_RECOMMENDED_MODELS;

// ---------------------------------------------------------------------------
// Step 0: Mode Selection
// ---------------------------------------------------------------------------

interface StepModeProps {
  onSelect: () => void;
}

function StepMode({ onSelect }: StepModeProps) {
  const setMode = useAppModeStore((s) => s.setMode);
  const currentMode = useAppModeStore((s) => s.mode);

  const handleSelect = (mode: 'local' | 'cloud') => {
    setMode(mode);
    onSelect();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground">Choose your mode</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Pick how you want to use AGI Workforce. You can change this later in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Local Mode */}
        <button
          type="button"
          onClick={() => handleSelect('local')}
          className={cn(
            'flex flex-col items-start gap-3 rounded-xl border p-6 cursor-pointer transition-all text-left',
            currentMode === 'local'
              ? 'ring-2 ring-teal-500 border-teal-500/50 bg-white/5'
              : 'border-white/10 hover:border-white/20',
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <HardDrive className="w-5 h-5 text-amber-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Local Mode</p>
            <p className="text-xs text-teal-400 font-medium">Free, private, yours</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
              Use local models (Ollama, LM Studio) or your own API keys. No account needed.
              Everything stays on your device.
            </p>
          </div>
          <div
            className={cn(
              'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
            )}
          >
            Start Local
          </div>
        </button>

        {/* Cloud Mode */}
        <button
          type="button"
          onClick={() => handleSelect('cloud')}
          className={cn(
            'flex flex-col items-start gap-3 rounded-xl border p-6 cursor-pointer transition-all text-left',
            currentMode === 'cloud'
              ? 'ring-2 ring-teal-500 border-teal-500/50 bg-white/5'
              : 'border-white/10 hover:border-white/20',
          )}
        >
          <div className="flex items-center gap-2 w-full">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Cloud className="w-5 h-5 text-blue-400" />
            </div>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Pro $20/mo
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Cloud Mode</p>
            <p className="text-xs text-blue-400 font-medium">Frontier models, synced everywhere</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
              Get Claude, GPT-5.4, Gemini included. Sync conversations across desktop, web, and
              mobile.
            </p>
          </div>
          <div
            className={cn(
              'mt-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-primary text-white hover:bg-primary/90',
            )}
          >
            Sign In
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function StepWelcome() {
  const desktopFeatures = [
    {
      icon: Cpu,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      title: 'Multi-Model Routing',
      desc: 'Claude, GPT-5, Gemini, Llama — all in one place. Pick any model or let Auto choose.',
    },
    {
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      title: 'Desktop Autonomy',
      desc: 'Real browser control, file access, terminal commands — no sandboxed web app.',
    },
    {
      icon: Smartphone,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      title: 'Mobile Companion',
      desc: 'Pair your phone to monitor agents, approve actions, and chat on the go.',
    },
    {
      icon: Shield,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      title: 'Your Keys, Your Data',
      desc: 'Full BYOK support — bring your own API keys or use local LLMs. Zero lock-in.',
    },
  ];

  const webFeatures = [
    {
      icon: Cpu,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      title: 'Multi-Model Routing',
      desc: 'Claude, GPT-5, Gemini — all in one place. Pick any model or let Auto choose.',
    },
    {
      icon: Bot,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      title: 'AI Agents',
      desc: 'Autonomous agents that research, write, analyze, and execute tasks for you.',
    },
    {
      icon: Smartphone,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      title: 'Cross-Device Sync',
      desc: 'Access your conversations from desktop, web, and mobile — always in sync.',
    },
    {
      icon: Wand2,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      title: '150+ AI Skills',
      desc: 'Research, writing, coding, analysis — pre-built skills ready to use.',
    },
  ];

  const features = isCloudWeb ? webFeatures : desktopFeatures;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground">Welcome to AGI Workforce</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {isCloudWeb
            ? 'Your on-demand AI workforce — multi-model routing, agents, and 150+ skills.'
            : 'The multi-model AI desktop that beats Claude Desktop, ChatGPT, and Gemini.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card"
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                f.bg,
              )}
            >
              <f.icon className={cn('w-4 h-4', f.color)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground leading-tight">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: API Keys
// ---------------------------------------------------------------------------

function StepApiKeys() {
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const allProviders = [
    { name: 'Anthropic (Claude)', required: false, label: 'Most capable models' },
    { name: 'OpenAI (GPT-5)', required: false, label: 'Best for coding' },
    { name: 'Google (Gemini)', required: false, label: 'Large context window' },
    { name: 'Ollama / LM Studio', required: false, label: 'Free — runs locally, no key needed' },
  ];

  // Web is cloud-only — hide local-only providers
  const providers = isCloudWeb
    ? allProviders.filter((p) => !p.name.includes('Ollama'))
    : allProviders;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1.5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Key className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect your AI providers</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {isCloudWeb
            ? 'Your cloud plan includes all models. Optionally add your own keys.'
            : 'Add at least one API key to get started. You can also use local models for free.'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {providers.map((p) => (
          <div key={p.name} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.label}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => openSettings('api-keys')}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
          'bg-primary text-white font-medium text-sm',
          'hover:bg-primary/90 transition-colors',
          'shadow-lg shadow-primary/20',
        )}
      >
        <Key className="w-4 h-4" />
        Open API Key Settings
        <ExternalLink className="w-3.5 h-3.5 opacity-70" />
      </button>

      <p className="text-xs text-center text-muted-foreground">
        You can skip this and add keys later in{' '}
        <button
          type="button"
          onClick={() => openSettings('api-keys')}
          className="text-primary hover:underline"
        >
          Settings
        </button>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Model Selection
// ---------------------------------------------------------------------------

interface StepModelProps {
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

function StepModel({ selectedModel, onSelectModel }: StepModelProps) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1.5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Cpu className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground">Choose your default model</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          You can change this any time from the chat interface.
        </p>
      </div>

      <div className="space-y-2">
        {RECOMMENDED_MODELS.map((model) => {
          const isSelected = selectedModel === model.id;
          return (
            <button
              type="button"
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left',
                'transition-colors duration-150',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                  : 'border-border bg-card hover:border-border/80 hover:bg-card/80',
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center',
                  isSelected ? 'border-primary' : 'border-muted-foreground/30',
                )}
              >
                {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{model.label}</span>
                  <span
                    className={cn('text-xs px-1.5 py-0.5 rounded-md font-medium', model.badgeColor)}
                  >
                    {model.badge}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Quick Tour
// ---------------------------------------------------------------------------

function StepTour() {
  const highlights = [
    {
      icon: MessageSquare,
      color: 'text-primary',
      bg: 'bg-primary/10',
      title: 'Chat',
      desc: 'Type naturally. Attach files, images, code. Switch models mid-conversation.',
    },
    {
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      title: 'Tools & Automation',
      desc: 'Your AI can browse the web, run terminal commands, read/write files, and control apps.',
    },
    {
      icon: Bot,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      title: 'Agent Workflows',
      desc: 'Kick off multi-step tasks. The agent runs in the background while you do other things.',
    },
    {
      icon: Wand2,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      title: '150+ Skills',
      desc: 'Healthcare, legal, finance, coding — specialized AI skills for every domain.',
    },
    {
      icon: Settings,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      title: 'Settings',
      desc: 'Cmd+, to open settings. Tweak model routing, API keys, keybindings, themes, and more.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1.5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Map className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground">A quick tour</h2>
        <p className="text-sm text-muted-foreground">Everything you need to know in 30 seconds.</p>
      </div>

      <div className="space-y-2">
        {highlights.map((h) => (
          <div
            key={h.title}
            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-card"
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                h.bg,
              )}
            >
              <h.icon className={cn('w-4 h-4', h.color)} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{h.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{h.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Ready
// ---------------------------------------------------------------------------

interface StepReadyProps {
  onComplete: () => void;
  onOpenSettings: () => void;
  onBrowseSkills: () => void;
}

function StepReady({ onComplete, onOpenSettings, onBrowseSkills }: StepReadyProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/20">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground">You&apos;re all set!</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          AGI Workforce is ready. Here&apos;s where to go next.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={onComplete}
          className={cn(
            'flex items-center justify-between px-5 py-4 rounded-xl',
            'bg-primary text-white font-medium text-sm',
            'hover:bg-primary/90 transition-colors',
            'shadow-lg shadow-primary/20',
          )}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5" />
            <span>Start Chatting</span>
          </div>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </button>

        <button
          type="button"
          onClick={onBrowseSkills}
          className={cn(
            'flex items-center justify-between px-5 py-4 rounded-xl',
            'border border-border bg-card text-foreground font-medium text-sm',
            'hover:bg-accent transition-colors',
          )}
        >
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-blue-400" />
            <span>Browse Skills</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={cn(
            'flex items-center justify-between px-5 py-4 rounded-xl',
            'border border-border bg-card text-foreground font-medium text-sm',
            'hover:bg-accent transition-colors',
          )}
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span>Open Settings</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress stepper (top)
// ---------------------------------------------------------------------------

interface StepperProps {
  steps: Step[];
  currentIndex: number;
}

function Stepper({ steps, currentIndex }: StepperProps) {
  return (
    <div className="flex items-center justify-between w-full mb-6">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                  isDone
                    ? 'bg-primary border-primary text-white'
                    : isCurrent
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-muted-foreground/20 text-muted-foreground/40',
                )}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium hidden sm:block',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground/50',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-1 rounded-full transition-colors',
                  i < currentIndex ? 'bg-primary' : 'bg-muted-foreground/10',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main OnboardingWizard
// ---------------------------------------------------------------------------

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedModel, setSelectedModel] = useState('auto');
  const completeOnboarding = useSimpleModeStore((s) => s.completeOnboarding);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const currentStep = STEPS[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === STEPS.length - 1;

  const handleFinish = () => {
    completeOnboarding();
    onComplete();
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleOpenSettings = () => {
    handleFinish();
    openSettings();
  };

  const handleBrowseSkills = () => {
    handleFinish();
    // Skills/tools are in the connectors/tools section in settings
    openSettings('connectors');
  };

  const renderStep = () => {
    switch (currentStep?.id) {
      case 'mode':
        return <StepMode onSelect={handleNext} />;
      case 'welcome':
        return <StepWelcome />;
      case 'api-keys':
        return <StepApiKeys />;
      case 'model':
        return <StepModel selectedModel={selectedModel} onSelectModel={setSelectedModel} />;
      case 'tour':
        return <StepTour />;
      case 'ready':
        return (
          <StepReady
            onComplete={handleFinish}
            onOpenSettings={handleOpenSettings}
            onBrowseSkills={handleBrowseSkills}
          />
        );
      default:
        return null;
    }
  };

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

        <div className="p-6 pt-5">
          <Stepper steps={STEPS} currentIndex={currentIndex} />

          {/* Step content */}
          <div className="min-h-[340px]">{renderStep()}</div>

          {/* Navigation footer — hidden on ready step (own CTAs) and mode step (card-click advances) */}
          {currentStep?.id !== 'ready' && currentStep?.id !== 'mode' && (
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
              <button
                type="button"
                onClick={handleBack}
                disabled={isFirst}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isFirst
                    ? 'text-muted-foreground/30 cursor-not-allowed'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip setup
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className={cn(
                    'flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                    'bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20',
                  )}
                >
                  {currentIndex === STEPS.length - 2 ? 'Finish' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
