import { useEffect, useRef, useState } from 'react';
import {
  X,
  User,
  CreditCard,
  Shield,
  BarChart2,
  Zap,
  Plug,
  Key,
  Mic,
  Bot,
  Settings,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { Button } from './ui/Button';

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: <Settings size={15} /> },
  { id: 'account', label: 'Account', icon: <User size={15} /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield size={15} /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={15} /> },
  { id: 'usage', label: 'Usage', icon: <BarChart2 size={15} /> },
  { id: 'capabilities', label: 'Capabilities', icon: <Zap size={15} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={15} /> },
  { id: 'models', label: 'Models & Keys', icon: <Key size={15} /> },
  { id: 'voice', label: 'Voice', icon: <Mic size={15} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={15} /> },
];

// ─── Small reusable sub-components ───────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--chat-text-primary)]">{label}</p>
        {description && (
          <p className="text-xs text-[var(--chat-text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
          checked ? 'bg-[var(--chat-accent-primary)]' : 'bg-[var(--chat-surface-hover)]',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
        {title}
      </h3>
      <div className="divide-y divide-[var(--chat-border)]">{children}</div>
    </div>
  );
}

interface RadioRowProps {
  label: string;
  description?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}

function RadioRow({ label, description, options, value, onChange }: RadioRowProps) {
  return (
    <div className="py-2.5">
      <p className="mb-2 text-sm font-medium text-[var(--chat-text-primary)]">{label}</p>
      {description && <p className="mb-2 text-xs text-[var(--chat-text-muted)]">{description}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[var(--chat-radius-md)] border px-3 py-1.5 text-sm transition-colors',
              value === opt.value
                ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                : 'border-[var(--chat-border)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TextInputRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function TextInputRow({ label, value, onChange, placeholder, type = 'text' }: TextInputRowProps) {
  return (
    <div className="py-2.5">
      <label className="mb-1.5 block text-sm font-medium text-[var(--chat-text-primary)]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
          'px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]',
          'transition-colors',
        )}
      />
    </div>
  );
}

// ─── Tab content panels ───────────────────────────────────────────────────────

function GeneralTab() {
  const profile = useSettingsStore((s) => s.profile);
  const updateProfile = useSettingsStore((s) => s.updateProfile);
  const notifyCompletions = useSettingsStore((s) => s.notifyCompletions);
  const notifyAgentUpdates = useSettingsStore((s) => s.notifyAgentUpdates);
  const toggleNotifyCompletions = useSettingsStore((s) => s.toggleNotifyCompletions);
  const toggleNotifyAgentUpdates = useSettingsStore((s) => s.toggleNotifyAgentUpdates);

  const { themeMode, setThemeMode } = useTheme();

  const workTypeOptions = [
    'Product Management',
    'Engineering',
    'Design',
    'Marketing',
    'Legal',
    'Finance',
    'Healthcare',
    'Education',
    'Other',
  ];

  return (
    <div>
      <Section title="Profile">
        <TextInputRow
          label="Full name"
          value={profile.fullName}
          onChange={(v) => updateProfile({ fullName: v })}
          placeholder="Your full name"
        />
        <TextInputRow
          label="Nickname"
          value={profile.nickname}
          onChange={(v) => updateProfile({ nickname: v })}
          placeholder="What should the AI call you?"
        />
        <div className="py-2.5">
          <label className="mb-1.5 block text-sm font-medium text-[var(--chat-text-primary)]">
            Work type
          </label>
          <select
            value={profile.workType}
            onChange={(e) => updateProfile({ workType: e.target.value })}
            className={cn(
              'w-full rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
              'px-3 py-2 text-sm text-[var(--chat-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]',
              'transition-colors',
            )}
          >
            <option value="">Select your work type</option>
            {workTypeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="py-2.5">
          <label className="mb-1.5 block text-sm font-medium text-[var(--chat-text-primary)]">
            Preferences
          </label>
          <textarea
            value={profile.personalPreferences}
            onChange={(e) => updateProfile({ personalPreferences: e.target.value })}
            placeholder="Tell the AI about your preferences, communication style, or anything useful..."
            rows={3}
            className={cn(
              'w-full rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
              'px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]',
              'resize-none transition-colors',
            )}
          />
        </div>
      </Section>

      <Section title="Notifications">
        <ToggleRow
          label="Completions"
          description="Notify when a long response finishes"
          checked={notifyCompletions}
          onChange={toggleNotifyCompletions}
        />
        <ToggleRow
          label="Agent updates"
          description="Notify when agents complete tasks"
          checked={notifyAgentUpdates}
          onChange={toggleNotifyAgentUpdates}
        />
      </Section>

      <Section title="Appearance">
        <RadioRow
          label="Theme"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
          value={themeMode}
          onChange={(v) => setThemeMode(v as 'dark' | 'light' | 'system')}
        />
      </Section>
    </div>
  );
}

function AccountTab() {
  const profile = useSettingsStore((s) => s.profile);

  return (
    <div>
      <Section title="Account">
        <div className="py-2.5">
          <p className="mb-1 text-xs text-[var(--chat-text-muted)]">Email</p>
          <p className="text-sm text-[var(--chat-text-primary)]">{profile.email || 'Not set'}</p>
        </div>
        <div className="py-2.5">
          <p className="mb-1 text-xs text-[var(--chat-text-muted)]">Plan</p>
          <p className="text-sm font-medium text-[var(--chat-text-primary)] capitalize">
            {profile.plan}
          </p>
        </div>
      </Section>
      <Section title="Session">
        <div className="py-2.5">
          <Button variant="destructive" size="sm">
            Log out
          </Button>
        </div>
      </Section>
    </div>
  );
}

function PrivacyTab() {
  return (
    <div>
      <Section title="Data & Privacy">
        <ToggleRow
          label="Location access"
          description="Allow the AI to use your approximate location for relevant responses"
          checked={false}
          onChange={() => {}}
        />
        <ToggleRow
          label="Opt out of training"
          description="Your conversations will not be used to improve AI models"
          checked={true}
          onChange={() => {}}
        />
      </Section>
      <Section title="Data export">
        <div className="py-2.5">
          <p className="mb-2 text-sm text-[var(--chat-text-secondary)]">
            Download all your conversations and data in JSON format.
          </p>
          <Button variant="outline" size="sm">
            Export my data
          </Button>
        </div>
      </Section>
    </div>
  );
}

function BillingTab() {
  const profile = useSettingsStore((s) => s.profile);

  return (
    <div>
      <Section title="Current plan">
        <div className="py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium capitalize text-[var(--chat-text-primary)]">
                {profile.plan === 'free' ? 'Free' : profile.plan}
              </p>
              <p className="text-xs text-[var(--chat-text-muted)]">
                {profile.plan === 'free'
                  ? 'Limited usage with shared resources'
                  : 'Full access with priority routing'}
              </p>
            </div>
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Usage this month">
        <div className="py-2.5 text-sm text-[var(--chat-text-muted)]">
          Detailed usage breakdown coming soon.
        </div>
      </Section>
    </div>
  );
}

function UsageTab() {
  return (
    <div>
      <Section title="API usage">
        <div className="py-2.5 space-y-3">
          {['Anthropic', 'OpenAI', 'Google'].map((provider) => (
            <div key={provider}>
              <div className="mb-1 flex justify-between text-xs text-[var(--chat-text-secondary)]">
                <span>{provider}</span>
                <span>0 / unlimited</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--chat-surface-hover)]">
                <div className="h-1.5 w-0 rounded-full bg-[var(--chat-accent-primary)]" />
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Storage">
        <div className="py-2.5">
          <div className="mb-1 flex justify-between text-xs text-[var(--chat-text-secondary)]">
            <span>Conversation history</span>
            <span>0 KB</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--chat-surface-hover)]">
            <div className="h-1.5 w-0 rounded-full bg-[var(--chat-accent-primary)]" />
          </div>
        </div>
      </Section>
    </div>
  );
}

function CapabilitiesTab() {
  const artifactsEnabled = useSettingsStore((s) => s.artifactsEnabled);
  const codeExecutionEnabled = useSettingsStore((s) => s.codeExecutionEnabled);
  const memorySearchChats = useSettingsStore((s) => s.memorySearchChats);
  const memoryGenerateFromHistory = useSettingsStore((s) => s.memoryGenerateFromHistory);
  const toolAccessMode = useSettingsStore((s) => s.toolAccessMode);
  const toggleArtifacts = useSettingsStore((s) => s.toggleArtifacts);
  const toggleCodeExecution = useSettingsStore((s) => s.toggleCodeExecution);
  const setToolAccessMode = useSettingsStore((s) => s.setToolAccessMode);
  const toggleMemorySearchChats = useSettingsStore((s) => s.toggleMemorySearchChats);
  const toggleMemoryGenerateFromHistory = useSettingsStore(
    (s) => s.toggleMemoryGenerateFromHistory,
  );

  return (
    <div>
      <Section title="Memory">
        <ToggleRow
          label="Search past chats"
          description="Allow the AI to recall relevant context from previous conversations"
          checked={memorySearchChats}
          onChange={toggleMemorySearchChats}
        />
        <ToggleRow
          label="Generate memories from history"
          description="Automatically extract key facts and preferences from your conversations"
          checked={memoryGenerateFromHistory}
          onChange={toggleMemoryGenerateFromHistory}
        />
      </Section>
      <Section title="Tool access">
        <RadioRow
          label="When to use tools"
          description="Controls how eagerly the AI invokes tools and web search"
          options={[
            { value: 'lazy', label: 'Minimal (ask first)' },
            { value: 'eager', label: 'Proactive (auto-use)' },
          ]}
          value={toolAccessMode}
          onChange={(v) => setToolAccessMode(v as 'lazy' | 'eager')}
        />
      </Section>
      <Section title="Output">
        <ToggleRow
          label="Artifacts"
          description="Render code, documents, and visualizations in the artifact panel"
          checked={artifactsEnabled}
          onChange={toggleArtifacts}
        />
        <ToggleRow
          label="Code execution"
          description="Allow the AI to run code in a sandboxed environment"
          checked={codeExecutionEnabled}
          onChange={toggleCodeExecution}
        />
      </Section>
    </div>
  );
}

function ConnectorsTab() {
  return (
    <div>
      <Section title="Connected services">
        <div className="py-2.5 text-sm text-[var(--chat-text-muted)]">No connectors added yet.</div>
      </Section>
      <Section title="Browse">
        <div className="py-2.5">
          <p className="mb-2 text-sm text-[var(--chat-text-secondary)]">
            Connect your tools — Slack, GitHub, Notion, Google Drive, and more.
          </p>
          <Button variant="outline" size="sm">
            Browse connectors
          </Button>
        </div>
      </Section>
    </div>
  );
}

interface ProviderDef {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    hint: 'Get your key at console.anthropic.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    hint: 'Get your key at platform.openai.com',
  },
  {
    id: 'google',
    label: 'Google',
    placeholder: 'AIza...',
    hint: 'Get your key at aistudio.google.com',
  },
];

function ModelsTab() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, ''])),
  );
  const [savedProvider, setSavedProvider] = useState<string | null>(null);

  function handleSave(providerId: string) {
    // Placeholder: actual persistence via SecretManager when runtime is wired
    setSavedProvider(providerId);
    setTimeout(() => setSavedProvider(null), 2000);
  }

  return (
    <div>
      <Section title="API keys (BYOK)">
        {PROVIDERS.map((p) => (
          <div key={p.id} className="py-2.5">
            <label className="mb-1.5 block text-sm font-medium text-[var(--chat-text-primary)]">
              {p.label}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeys[p.id] ?? ''}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder={p.placeholder}
                autoComplete="off"
                className={cn(
                  'flex-1 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
                  'px-3 py-2 font-mono text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]',
                  'transition-colors',
                )}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(p.id)}
                disabled={!apiKeys[p.id]?.trim()}
                className="shrink-0"
              >
                {savedProvider === p.id ? 'Saved' : 'Save'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--chat-text-muted)]">{p.hint}</p>
          </div>
        ))}
      </Section>
      <Section title="Local LLMs">
        <div className="py-2.5 text-sm text-[var(--chat-text-muted)]">
          Ollama and LM Studio support coming soon.
        </div>
      </Section>
    </div>
  );
}

function VoiceTab() {
  return (
    <div>
      <Section title="Voice input">
        <div className="py-2.5 text-sm text-[var(--chat-text-muted)]">
          Voice settings coming soon.
        </div>
      </Section>
    </div>
  );
}

function AgentsTab() {
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const setAutoApproveMode = useSettingsStore((s) => s.setAutoApproveMode);

  return (
    <div>
      <Section title="Auto-approve mode">
        <RadioRow
          label="When agents request actions"
          description="Controls how much autonomy agents have when executing desktop tasks"
          options={[
            { value: 'ask', label: 'Ask every time' },
            { value: 'smart', label: 'Smart approval' },
            { value: 'full', label: 'Full auto' },
          ]}
          value={autoApproveMode}
          onChange={(v) => setAutoApproveMode(v as 'ask' | 'smart' | 'full')}
        />
        {autoApproveMode === 'full' && (
          <p className="mt-1 rounded-[var(--chat-radius-md)] bg-[var(--chat-warning)]/10 px-3 py-2 text-xs text-[var(--chat-warning)]">
            Full auto grants agents permission to run any approved tool without confirmation.
          </p>
        )}
      </Section>
    </div>
  );
}

// ─── Tab content renderer ─────────────────────────────────────────────────────

function renderTabContent(tabId: string) {
  switch (tabId) {
    case 'general':
      return <GeneralTab />;
    case 'account':
      return <AccountTab />;
    case 'privacy':
      return <PrivacyTab />;
    case 'billing':
      return <BillingTab />;
    case 'usage':
      return <UsageTab />;
    case 'capabilities':
      return <CapabilitiesTab />;
    case 'connectors':
      return <ConnectorsTab />;
    case 'models':
      return <ModelsTab />;
    case 'voice':
      return <VoiceTab />;
    case 'agents':
      return <AgentsTab />;
    default:
      return null;
  }
}

// ─── Main SettingsModal component ─────────────────────────────────────────────

export function SettingsModal() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const settingsTab = useUIStore((s) => s.settingsTab);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const openSettings = useUIStore((s) => s.openSettings);

  const contentRef = useRef<HTMLDivElement>(null);

  // Escape key closes the modal
  useEffect(() => {
    if (!settingsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeSettings();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [settingsOpen, closeSettings]);

  // Scroll content area to top on tab switch
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [settingsTab]);

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-label="Settings"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeSettings}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className={cn(
          'relative z-10 flex w-full max-w-3xl overflow-hidden rounded-xl',
          'bg-[var(--chat-surface-base)] border border-[var(--chat-border)]',
          'shadow-xl',
          'max-h-[80vh]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-3">
          <div className="mb-3 px-4 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
              Settings
            </p>
          </div>
          <nav className="flex-1 space-y-0.5 px-2" aria-label="Settings navigation">
            {TABS.map((tab) => {
              const isActive = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => openSettings(tab.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[var(--chat-radius-md)] px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-[var(--chat-accent-primary)]/12 text-[var(--chat-accent-primary)] font-medium'
                      : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="shrink-0">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--chat-border)] px-5 py-3">
            <h2 className="text-sm font-semibold text-[var(--chat-text-primary)]">
              {TABS.find((t) => t.id === settingsTab)?.label ?? 'Settings'}
            </h2>
            <button
              onClick={closeSettings}
              aria-label="Close settings"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[var(--chat-radius-md)] transition-colors',
                'text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              )}
            >
              <X size={15} />
            </button>
          </div>

          {/* Scrollable content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4">
            {renderTabContent(settingsTab)}
          </div>
        </div>
      </div>
    </div>
  );
}
