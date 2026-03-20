import { Moon, Sun, Palette, Upload, Download, Trash2, Plus, Type, Check } from 'lucide-react';
import { useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';

import { cn } from '../../lib/utils';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';

import {
  BUILTIN_THEMES,
  getCustomThemes,
  applyTheme,
  getThemeById,
  saveCustomTheme,
  deleteCustomTheme,
} from '../../themes';
import type { ThemeDefinition } from '../../themes';
import { useSettingsStore } from '../../stores/settingsStore';
import { ThemeEditorDialog } from './ThemeEditorDialog';

/** localStorage key used by ThemeProvider — must stay in sync with main.tsx. */
const THEME_STORAGE_KEY = 'agiworkforce-theme';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const REQUIRED_COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'input',
  'ring',
] as const;

function validateTheme(
  raw: unknown,
): { valid: true; theme: ThemeDefinition } | { valid: false; missing: string[] } {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, missing: ['id', 'name', 'variant', 'colors'] };
  }
  const obj = raw as Record<string, unknown>;
  const missing: string[] = [];

  if (typeof obj['id'] !== 'string' || !obj['id']) missing.push('id');
  if (typeof obj['name'] !== 'string' || !obj['name']) missing.push('name');
  if (obj['variant'] !== 'dark' && obj['variant'] !== 'light') missing.push('variant');
  if (typeof obj['colors'] !== 'object' || obj['colors'] === null) {
    missing.push('colors');
  } else {
    const colors = obj['colors'] as Record<string, unknown>;
    for (const key of REQUIRED_COLOR_KEYS) {
      if (typeof colors[key] !== 'string') missing.push(`colors.${key}`);
    }
  }

  if (missing.length > 0) return { valid: false, missing };
  return { valid: true, theme: raw as ThemeDefinition };
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function importThemeFromFile(onRefresh: () => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string) as unknown;
        const result = validateTheme(raw);
        if (!result.valid) {
          toast.error(`Invalid theme: missing ${result.missing.join(', ')}`);
          return;
        }
        saveCustomTheme(result.theme);
        toast.success(`Theme "${result.theme.name}" imported`);
        onRefresh();
      } catch {
        toast.error('Failed to parse theme file — ensure it is valid JSON');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportThemeToFile(theme: ThemeDefinition): void {
  const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${theme.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success(`Exported "${theme.name}"`);
}

// ---------------------------------------------------------------------------
// ThemePreviewCard
// ---------------------------------------------------------------------------

type BaseThemeMode = 'light' | 'dark' | 'system';

interface ThemePreviewCardProps {
  mode: BaseThemeMode;
  isSelected: boolean;
  onClick: () => void;
}

function LightMiniUI() {
  return (
    <div className="h-full w-full bg-white">
      {/* Title bar */}
      <div className="flex h-5 items-center gap-1 border-b border-gray-200 bg-gray-100 px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        <span className="ml-1 h-1.5 w-12 rounded-sm bg-gray-300" />
      </div>
      <div className="flex h-[calc(100%-20px)]">
        {/* Sidebar */}
        <div className="flex w-8 flex-col gap-1.5 border-r border-gray-200 bg-gray-50 px-1.5 py-2">
          <span className="h-1.5 w-full rounded-sm bg-blue-400" />
          <span className="h-1.5 w-full rounded-sm bg-gray-300" />
          <span className="h-1.5 w-full rounded-sm bg-gray-300" />
          <span className="h-1.5 w-full rounded-sm bg-gray-300" />
        </div>
        {/* Content */}
        <div className="flex flex-1 flex-col gap-2 p-2">
          <span className="h-1.5 w-3/4 rounded-sm bg-gray-700" />
          <span className="h-1.5 w-1/2 rounded-sm bg-gray-400" />
          <span className="h-1.5 w-5/6 rounded-sm bg-gray-400" />
          <span className="mt-1 h-4 w-12 rounded bg-blue-500" />
        </div>
      </div>
    </div>
  );
}

function DarkMiniUI() {
  return (
    <div className="h-full w-full bg-gray-900">
      {/* Title bar */}
      <div className="flex h-5 items-center gap-1 border-b border-gray-700 bg-gray-800 px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        <span className="ml-1 h-1.5 w-12 rounded-sm bg-gray-600" />
      </div>
      <div className="flex h-[calc(100%-20px)]">
        {/* Sidebar */}
        <div className="flex w-8 flex-col gap-1.5 border-r border-gray-700 bg-gray-800 px-1.5 py-2">
          <span className="h-1.5 w-full rounded-sm bg-blue-400" />
          <span className="h-1.5 w-full rounded-sm bg-gray-600" />
          <span className="h-1.5 w-full rounded-sm bg-gray-600" />
          <span className="h-1.5 w-full rounded-sm bg-gray-600" />
        </div>
        {/* Content */}
        <div className="flex flex-1 flex-col gap-2 p-2">
          <span className="h-1.5 w-3/4 rounded-sm bg-gray-200" />
          <span className="h-1.5 w-1/2 rounded-sm bg-gray-500" />
          <span className="h-1.5 w-5/6 rounded-sm bg-gray-500" />
          <span className="mt-1 h-4 w-12 rounded bg-blue-500" />
        </div>
      </div>
    </div>
  );
}

function SystemMiniUI() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left half — light */}
      <div className="flex h-full w-1/2 flex-col bg-white">
        <div className="flex h-5 items-center gap-1 border-b border-gray-200 bg-gray-100 px-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-5 rounded-sm bg-gray-300" />
        </div>
        <div className="flex flex-1">
          <div className="flex w-5 flex-col gap-1 border-r border-gray-200 bg-gray-50 px-1 py-1.5">
            <span className="h-1 w-full rounded-sm bg-blue-400" />
            <span className="h-1 w-full rounded-sm bg-gray-300" />
            <span className="h-1 w-full rounded-sm bg-gray-300" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-1.5">
            <span className="h-1 w-3/4 rounded-sm bg-gray-700" />
            <span className="h-1 w-1/2 rounded-sm bg-gray-400" />
            <span className="h-1 w-full rounded-sm bg-gray-400" />
          </div>
        </div>
      </div>
      {/* Divider line */}
      <div className="w-px bg-gray-400/40" />
      {/* Right half — dark */}
      <div className="flex h-full w-1/2 flex-col bg-gray-900">
        <div className="flex h-5 items-center gap-1 border-b border-gray-700 bg-gray-800 px-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="h-1.5 w-5 rounded-sm bg-gray-600" />
        </div>
        <div className="flex flex-1">
          <div className="flex w-5 flex-col gap-1 border-r border-gray-700 bg-gray-800 px-1 py-1.5">
            <span className="h-1 w-full rounded-sm bg-blue-400" />
            <span className="h-1 w-full rounded-sm bg-gray-600" />
            <span className="h-1 w-full rounded-sm bg-gray-600" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-1.5">
            <span className="h-1 w-3/4 rounded-sm bg-gray-200" />
            <span className="h-1 w-1/2 rounded-sm bg-gray-500" />
            <span className="h-1 w-full rounded-sm bg-gray-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

const BASE_THEME_LABEL: Record<BaseThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

function ThemePreviewCard({ mode, isSelected, onClick }: ThemePreviewCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Select ${BASE_THEME_LABEL[mode]} theme`}
      className={cn(
        'group relative flex w-40 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-1 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected
          ? 'border-blue-500 shadow-md shadow-blue-500/20'
          : 'border-white/10 hover:border-white/20',
      )}
    >
      {/* Mini UI preview */}
      <div className="h-28 w-full overflow-hidden rounded-lg">
        {mode === 'light' && <LightMiniUI />}
        {mode === 'dark' && <DarkMiniUI />}
        {mode === 'system' && <SystemMiniUI />}
      </div>

      {/* Selected checkmark badge */}
      {isSelected && (
        <span
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 shadow"
          aria-hidden
        >
          <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
        </span>
      )}

      {/* Label */}
      <span className="pb-1 text-xs font-medium text-foreground">{BASE_THEME_LABEL[mode]}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ThemeSwatch
// ---------------------------------------------------------------------------

interface ThemeSwatchProps {
  theme: ThemeDefinition;
  isActive: boolean;
  isCustom?: boolean;
  onClick: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

function ThemeSwatch({ theme, isActive, isCustom, onClick, onExport, onDelete }: ThemeSwatchProps) {
  const { colors, name, variant, author } = theme;

  const bgStyle = { backgroundColor: `hsl(${colors.background})` };
  const cardStyle = { backgroundColor: `hsl(${colors.card})` };
  const primaryStyle = { backgroundColor: `hsl(${colors.primary})` };
  const accentStyle = { backgroundColor: `hsl(${colors.accent})` };
  const fgStyle = { backgroundColor: `hsl(${colors.foreground})` };

  const handleExport = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onExport?.();
    },
    [onExport],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.();
    },
    [onDelete],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`Select ${name} theme`}
      className={[
        'group relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'border-primary shadow-md shadow-primary/20'
          : 'border-border hover:border-muted-foreground/40',
      ].join(' ')}
    >
      {/* Color preview mini-window */}
      <div
        className="h-16 w-full overflow-hidden rounded-lg border border-border/50"
        style={bgStyle}
      >
        <div
          className="flex items-center gap-1 px-2 py-1.5"
          style={{ backgroundColor: `hsl(${colors.card})` }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: `hsl(${colors.destructive})` }}
          />
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: `hsl(${colors.accent})` }}
          />
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: `hsl(${colors.primary})` }}
          />
        </div>
        <div className="flex gap-1.5 px-2 pb-1.5 pt-1">
          <div className="flex w-6 flex-col gap-1" style={cardStyle}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 rounded-sm" style={fgStyle} />
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <div className="h-1.5 w-3/4 rounded-sm" style={fgStyle} />
            <div className="h-1.5 w-1/2 rounded-sm" style={primaryStyle} />
          </div>
        </div>
      </div>

      {/* Color swatches row */}
      <div className="flex gap-1">
        {[bgStyle, cardStyle, primaryStyle, accentStyle, fgStyle].map((style, i) => (
          <span key={i} className="h-3 flex-1 rounded-sm border border-border/30" style={style} />
        ))}
      </div>

      {/* Theme name & meta */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="truncate text-xs font-semibold text-foreground">{name}</span>
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
              variant === 'dark' ? 'bg-slate-700/60 text-slate-300' : 'bg-amber-100 text-amber-700',
            ].join(' ')}
          >
            {variant === 'dark' ? (
              <Moon className="inline h-2 w-2" />
            ) : (
              <Sun className="inline h-2 w-2" />
            )}{' '}
            {variant}
          </span>
          {isCustom && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
              Custom
            </span>
          )}
        </div>
        {author && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">by {author}</p>}
      </div>

      {/* Custom theme action buttons */}
      {isCustom && (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onExport && (
            <button
              type="button"
              onClick={handleExport}
              aria-label={`Export ${name}`}
              title="Export theme"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`Delete ${name}`}
              title="Delete theme"
              className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Active indicator ring */}
      {isActive && (
        <span
          className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary"
          aria-hidden
        >
          <svg
            className="h-2.5 w-2.5 text-primary-foreground"
            fill="currentColor"
            viewBox="0 0 12 12"
          >
            <path d="M10 3L5 8 2 5l-1 1 4 4 6-6-1-1z" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ThemeSettings() {
  const selectedTheme = useSettingsStore((s) => s.windowPreferences.selectedTheme);
  const setSelectedTheme = useSettingsStore((s) => s.setSelectedTheme);
  const baseTheme = useSettingsStore((s) => s.windowPreferences.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const dyslexicFont = useSettingsStore((s) => s.windowPreferences.dyslexicFont ?? false);
  const setDyslexicFont = useSettingsStore((s) => s.setDyslexicFont);

  // Use a counter to force re-render after custom theme mutations
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() => getCustomThemes());
  const [showEditor, setShowEditor] = useState(false);
  const [deleteThemeId, setDeleteThemeId] = useState<string | null>(null);

  const darkThemes = useMemo(() => BUILTIN_THEMES.filter((t) => t.variant === 'dark'), []);
  const lightThemes = useMemo(() => BUILTIN_THEMES.filter((t) => t.variant === 'light'), []);

  const refresh = useCallback(() => setCustomThemes(getCustomThemes()), []);

  function handleSelect(themeId: string) {
    const theme = getThemeById(themeId);
    if (!theme) return;
    applyTheme(theme);
    setSelectedTheme(themeId);
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }

  function handleDelete(themeId: string, themeName: string) {
    deleteCustomTheme(themeId);
    // If the deleted theme was active, clear selection
    if (selectedTheme === themeId) {
      setSelectedTheme('');
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
    toast.success(`Deleted "${themeName}"`);
    refresh();
  }

  return (
    <div className="space-y-8">
      {showEditor && <ThemeEditorDialog onClose={() => setShowEditor(false)} onSaved={refresh} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Themes</h3>
            <p className="text-sm text-muted-foreground">
              Choose a color theme for the application. Changes apply immediately.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => importThemeFromFile(refresh)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button
            type="button"
            onClick={() => setShowEditor(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Theme
          </button>
        </div>
      </div>

      {/* Base theme mode selector */}
      <section>
        <h4 className="mb-3 text-sm font-medium">Mode</h4>
        <div className="flex flex-wrap gap-4">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <ThemePreviewCard
              key={mode}
              mode={mode}
              isSelected={baseTheme === mode}
              onClick={() => setTheme(mode)}
            />
          ))}
        </div>
      </section>

      {/* Dark Themes */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Moon className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Dark Themes</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {darkThemes.map((theme) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              isActive={selectedTheme === theme.id}
              onClick={() => handleSelect(theme.id)}
            />
          ))}
        </div>
      </section>

      {/* Light Themes */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sun className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Light Themes</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {lightThemes.map((theme) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              isActive={selectedTheme === theme.id}
              onClick={() => handleSelect(theme.id)}
            />
          ))}
        </div>
      </section>

      {/* Custom Themes */}
      {customThemes.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Custom Themes</h4>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {customThemes.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {customThemes.map((theme) => (
              <ThemeSwatch
                key={theme.id}
                theme={theme}
                isActive={selectedTheme === theme.id}
                isCustom
                onClick={() => handleSelect(theme.id)}
                onExport={() => exportThemeToFile(theme)}
                onDelete={() => setDeleteThemeId(theme.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Active theme footer */}
      {selectedTheme && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Active theme:{' '}
            <span className="font-medium text-foreground">
              {getThemeById(selectedTheme)?.name ?? selectedTheme}
            </span>
            . To revert to the default dark/light system setting, select a base theme in{' '}
            <strong>General</strong> settings.
          </p>
        </div>
      )}

      <AlertDialog
        open={deleteThemeId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteThemeId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this theme?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteThemeId !== null) {
                  const theme = customThemes.find((t) => t.id === deleteThemeId);
                  handleDelete(deleteThemeId, theme?.name ?? deleteThemeId);
                  setDeleteThemeId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accessibility */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Accessibility</h4>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-foreground">Dyslexic Friendly Font</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Uses OpenDyslexic, a typeface designed to improve readability for people with
                dyslexia. Applies to all text in the application.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dyslexicFont}
              aria-label="Toggle dyslexic friendly font"
              onClick={() => setDyslexicFont(!dyslexicFont)}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                dyslexicFont ? 'bg-primary' : 'bg-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  dyslexicFont ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>
          {dyslexicFont && (
            <p className="mt-3 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
              OpenDyslexic font is active. The font will load on first use.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
