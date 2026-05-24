'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';
import { useBillingStore } from '@/stores/unified/auth';

const THEME_OPTIONS = [
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

const STORAGE_KEY = 'agi.settings.general';

interface GeneralSettings {
  workDescription: string;
  instructions: string;
  chatFont: string;
  voice: string;
}

const DEFAULT_SETTINGS: GeneralSettings = {
  workDescription: '',
  instructions: '',
  chatFont: 'serif',
  voice: 'default',
};

function loadSettings(): GeneralSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GeneralSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: GeneralSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable in some contexts; fail silently.
  }
}

export default function GeneralSettingsPage() {
  const user = useBillingStore((s) => s.user);
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setMounted(true);
    setSettings(loadSettings());
  }, []);

  // Auto-save with 400ms debounce whenever settings change (after hydration)
  useEffect(() => {
    if (!mounted) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveSettings(settings);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, mounted]);

  const updateField = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const theme = !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  const meta = user?.user_metadata;
  const fullName =
    (meta?.['full_name'] as string) ??
    (meta?.['name'] as string) ??
    user?.email?.split('@')[0] ??
    '';
  const firstName = fullName.split(' ')[0] ?? '';
  const initials = fullName
    ? fullName
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <div className="flex flex-col gap-8">
      {/* Profile section */}
      <div>
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--chat-text-primary)' }}>
          Profile
        </h2>

        <div className="flex flex-col gap-5">
          <Row label="Avatar">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: 'var(--chat-accent-primary, #da7756)' }}
            >
              {initials}
            </div>
          </Row>

          <Row label="Full name">
            <span className="text-sm" style={{ color: 'var(--chat-text-primary)' }}>
              {fullName || '-'}
            </span>
          </Row>

          <Row label="What should AGI call you?">
            <span className="text-sm" style={{ color: 'var(--chat-text-primary)' }}>
              {firstName || '-'}
            </span>
          </Row>

          <Row label="What best describes your work?">
            <select
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                background: 'var(--chat-surface-elevated, transparent)',
                borderColor: 'var(--chat-border-strong)',
                color: 'var(--chat-text-secondary)',
              }}
              value={settings.workDescription}
              onChange={(e) => updateField('workDescription', e.target.value)}
            >
              <option value="">Select</option>
              <option value="engineering">Engineering</option>
              <option value="design">Design</option>
              <option value="product">Product</option>
              <option value="research">Research</option>
              <option value="writing">Writing</option>
              <option value="other">Other</option>
            </select>
          </Row>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--chat-text-secondary)' }}>
              Instructions for AGI
            </span>
            <p className="text-xs" style={{ color: 'var(--chat-text-muted)' }}>
              AGI will keep these in mind across chats and projects.
            </p>
            <textarea
              rows={4}
              placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
              className="mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--chat-surface-elevated, transparent)',
                borderColor: 'var(--chat-border-strong)',
                color: 'var(--chat-text-primary)',
              }}
              value={settings.instructions}
              onChange={(e) => updateField('instructions', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Preferences section */}
      <div>
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--chat-text-primary)' }}>
          Preferences
        </h2>

        <div className="flex flex-col gap-5">
          <Row label="Appearance">
            <div className="flex gap-1">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setNextTheme(opt.value)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                    style={{
                      borderColor: isActive
                        ? 'var(--chat-accent-primary)'
                        : 'var(--chat-border-strong)',
                      background: isActive ? 'var(--chat-accent-primary)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--chat-text-secondary)',
                    }}
                    title={opt.label}
                    aria-label={`${opt.label} theme`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label="Chat font">
            <select
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                background: 'var(--chat-surface-elevated, transparent)',
                borderColor: 'var(--chat-border-strong)',
                color: 'var(--chat-text-secondary)',
              }}
              value={settings.chatFont}
              onChange={(e) => updateField('chatFont', e.target.value)}
            >
              <option value="serif">Newsreader Serif</option>
              <option value="sans">System Sans</option>
              <option value="mono">JetBrains Mono</option>
            </select>
          </Row>

          <Row label="Voice">
            <select
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                background: 'var(--chat-surface-elevated, transparent)',
                borderColor: 'var(--chat-border-strong)',
                color: 'var(--chat-text-secondary)',
              }}
              value={settings.voice}
              onChange={(e) => updateField('voice', e.target.value)}
            >
              <option value="default">Default</option>
              <option value="warm">Warm</option>
              <option value="professional">Professional</option>
            </select>
          </Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ minHeight: 36 }}>
      <span className="shrink-0 text-sm" style={{ color: 'var(--chat-text-secondary)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
