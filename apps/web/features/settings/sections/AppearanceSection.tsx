'use client';

import { useEffect, useState } from 'react';
import { Check, Monitor, Sun, Moon } from 'lucide-react';
import { Switch } from '@agiworkforce/ui';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';
import {
  ACCENT_COLORS,
  useSettingsStore,
  type ChatTextSize,
} from '@shared/stores/web-settings-store';
import {
  CODE_THEMES,
  isCodeThemeId,
  type CodeThemeId,
} from '@agiworkforce/unified-chat/shiki-highlighter';
import {
  PreferenceSyncNotice,
  SETTINGS_SELECT_CLASS,
  SettingsPreferenceRow,
} from '@/features/settings/components/SettingsPreferenceRow';

const THEME_OPTIONS = [
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

export function AppearanceSection() {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1 font-medium text-foreground md:hidden max-md:-mb-4">Appearance</h1>
      <div className="flex flex-col gap-5">
        <PreferenceSyncNotice />
        <SettingsPreferenceRow label="Theme">
          <div className="flex gap-3" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNextTheme(opt.value)}
                  className="group flex flex-col items-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`${opt.label} theme`}
                  aria-pressed={isActive}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-16 items-center justify-center rounded-lg border bg-muted transition-colors ${isActive ? 'border-foreground text-foreground ring-1 ring-inset ring-foreground' : 'border-border text-muted-foreground group-hover:text-foreground'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={`text-sm ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsPreferenceRow>

        <AccentColorRow />
        <ContrastRow />
        <MotionRow />
        <ChatFontRow />
        <ChatTextSizeRow />
        <CodeBlockWrapRow />
        <CodeThemeRow />
      </div>
    </div>
  );
}

function AccentColorRow() {
  const accentColor = useSettingsStore((state) => state.accentColor);
  const setAccentColor = useSettingsStore((state) => state.setAccentColor);

  return (
    <SettingsPreferenceRow label="Accent colour">
      <div className="flex gap-1.5 pointer-coarse:gap-4" role="group" aria-label="Accent colour">
        {ACCENT_COLORS.map((accent) => {
          const isActive = accentColor === accent.value;
          return (
            <button
              key={accent.value}
              type="button"
              onClick={() => setAccentColor(accent.value)}
              data-accent-swatch={accent.value}
              title={accent.label}
              aria-label={`${accent.label} accent`}
              aria-pressed={isActive}
              className={`relative flex h-7 min-h-0 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-[''] ${isActive ? 'ring-2 ring-foreground' : 'ring-0'}`}
            >
              {isActive && <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </SettingsPreferenceRow>
  );
}

function MotionRow() {
  const motion = useSettingsStore((state) => state.motion);
  const setMotion = useSettingsStore((state) => state.setMotion);

  const options = [
    { value: 'system' as const, label: 'System' },
    { value: 'reduced' as const, label: 'Reduced' },
  ];

  return (
    <SettingsPreferenceRow
      label="Motion"
      hint="Less animation in replies and the interface. System follows your device."
    >
      <div className="flex gap-1" role="group" aria-label="Motion">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={motion === option.value}
            aria-label={`${option.label} motion`}
            onClick={() => setMotion(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              motion === option.value
                ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </SettingsPreferenceRow>
  );
}

const CONTRAST_SYSTEM = 'system';
const CONTRAST_HIGH = 'high';

function ContrastRow() {
  const highContrast = useSettingsStore((state) => state.highContrast);
  const setHighContrast = useSettingsStore((state) => state.setHighContrast);

  return (
    <SettingsPreferenceRow label="Contrast" hint="System follows your device setting.">
      <select
        value={highContrast ? CONTRAST_HIGH : CONTRAST_SYSTEM}
        onChange={(event) => setHighContrast(event.target.value === CONTRAST_HIGH)}
        aria-label="Contrast"
        className={SETTINGS_SELECT_CLASS}
      >
        <option value={CONTRAST_SYSTEM}>System</option>
        <option value={CONTRAST_HIGH}>High</option>
      </select>
    </SettingsPreferenceRow>
  );
}

function ChatFontRow() {
  const chatFont = useSettingsStore((state) => state.chatFont) ?? 'default';
  const setChatFont = useSettingsStore((state) => state.setChatFont);

  // Only families layout.tsx and globals.css actually load. 'dyslexic' is
  // self-hosted under public/fonts/opendyslexic/, the control this replaces
  // pointed at a CDN font the CSP blocked, so it fell back silently and
  // looked broken.
  const options = [
    { value: 'default' as const, label: 'Default' },
    { value: 'sans' as const, label: 'Sans' },
    { value: 'serif' as const, label: 'Serif' },
    { value: 'dyslexic' as const, label: 'Dyslexic friendly' },
  ];

  return (
    <SettingsPreferenceRow
      label="Chat font"
      hint="Applies to message text. Code always stays monospace."
    >
      <select
        value={chatFont}
        onChange={(event) => setChatFont(event.target.value as typeof chatFont)}
        aria-label="Chat font"
        className={SETTINGS_SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </SettingsPreferenceRow>
  );
}

function ChatTextSizeRow() {
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const setChatTextSize = useSettingsStore((state) => state.setChatTextSize);

  return (
    <SettingsPreferenceRow label="Chat text size">
      <select
        value={chatTextSize}
        onChange={(event) => setChatTextSize(event.target.value as ChatTextSize)}
        aria-label="Chat text size"
        className={SETTINGS_SELECT_CLASS}
      >
        <option value="small">Small</option>
        <option value="default">Default</option>
        <option value="large">Large</option>
      </select>
    </SettingsPreferenceRow>
  );
}

function CodeBlockWrapRow() {
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const setCodeBlockWrap = useSettingsStore((state) => state.setCodeBlockWrap);

  return (
    <SettingsPreferenceRow label="Wrap long code lines">
      <Switch
        checked={codeBlockWrap}
        aria-label="Wrap long code lines"
        onCheckedChange={setCodeBlockWrap}
      />
    </SettingsPreferenceRow>
  );
}

function CodeThemeRow() {
  const codeTheme = useSettingsStore((state) => state.codeTheme);
  const setCodeTheme = useSettingsStore((state) => state.setCodeTheme);

  return (
    <SettingsPreferenceRow
      label="Code theme"
      hint="Colours code blocks in dark mode. Light mode keeps high contrast."
    >
      <select
        value={codeTheme}
        onChange={(event) => {
          if (isCodeThemeId(event.target.value)) setCodeTheme(event.target.value);
        }}
        aria-label="Code theme"
        className={SETTINGS_SELECT_CLASS}
      >
        {(Object.keys(CODE_THEMES) as CodeThemeId[]).map((id) => (
          <option key={id} value={id}>
            {CODE_THEMES[id].label}
          </option>
        ))}
      </select>
    </SettingsPreferenceRow>
  );
}
