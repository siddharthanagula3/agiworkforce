'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';

const THEME_OPTIONS = [
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

const STORAGE_KEY = 'agi.settings.general';

interface GeneralSettings {
  chatFont: string;
  voice: string;
}

const DEFAULT_SETTINGS: GeneralSettings = {
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

  return (
    <div className="flex flex-col gap-8">
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
              <option value="serif">Instrument Serif</option>
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
