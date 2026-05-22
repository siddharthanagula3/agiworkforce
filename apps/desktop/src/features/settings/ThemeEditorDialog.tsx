/**
 * ThemeEditorDialog
 *
 * A dialog for creating a new custom theme from scratch.
 * Provides color pickers for each ThemeColors field, name/ID/variant fields,
 * and a live mini-preview that reflects changes instantly.
 */

import { useState, useCallback } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ThemeDefinition, ThemeColors } from '../../themes/types';
import { saveCustomTheme } from '../../themes';

// ---------------------------------------------------------------------------
// Default values for a new theme
// ---------------------------------------------------------------------------

const DEFAULT_COLORS: ThemeColors = {
  background: '222 47% 11%',
  foreground: '210 40% 98%',
  card: '222 47% 13%',
  cardForeground: '210 40% 98%',
  popover: '222 47% 13%',
  popoverForeground: '210 40% 98%',
  primary: '217 91% 60%',
  primaryForeground: '222 47% 11%',
  secondary: '217 32% 17%',
  secondaryForeground: '210 40% 98%',
  muted: '217 32% 17%',
  mutedForeground: '215 20% 65%',
  accent: '217 91% 60%',
  accentForeground: '222 47% 11%',
  destructive: '0 72% 51%',
  destructiveForeground: '210 40% 98%',
  border: '217 32% 22%',
  input: '217 32% 22%',
  ring: '217 91% 60%',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColorFieldProps {
  label: string;
  fieldKey: keyof ThemeColors;
  value: string;
  onChange: (key: keyof ThemeColors, value: string) => void;
}

interface ThemeEditorDialogProps {
  onClose: () => void;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an HSL string like "222 47% 11%" into a hex value for <input type="color">.
 * Returns a fallback if parsing fails.
 */
function hslStringToHex(hsl: string): string {
  try {
    const parts = hsl.trim().split(/\s+/);
    if (parts.length < 3) return '#000000';
    const h = parseFloat(parts[0] ?? '0');
    const s = parseFloat((parts[1] ?? '0%').replace('%', '')) / 100;
    const l = parseFloat((parts[2] ?? '0%').replace('%', '')) / 100;

    const a = s * Math.min(l, 1 - l);
    const f = (n: number): number => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    const toHex = (v: number): string =>
      Math.round(255 * v)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  } catch {
    return '#000000';
  }
}

/**
 * Convert a hex color string to an HSL string in the "H S% L%" format.
 */
function hexToHslString(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Generate a kebab-case ID from a theme name.
 */
function nameToId(name: string): string {
  return `custom-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

// ---------------------------------------------------------------------------
// ColorField sub-component
// ---------------------------------------------------------------------------

function ColorField({ label, fieldKey, value, onChange }: ColorFieldProps) {
  const hexValue = hslStringToHex(value);

  const handleColorInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(fieldKey, hexToHslString(e.target.value));
    },
    [fieldKey, onChange],
  );

  const handleTextInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(fieldKey, e.target.value);
    },
    [fieldKey, onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hexValue}
        onChange={handleColorInput}
        className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
        title={label}
        aria-label={`${label} color picker`}
      />
      <div className="min-w-0 flex-1">
        <label className="block text-[10px] text-muted-foreground">{label}</label>
        <input
          type="text"
          value={value}
          onChange={handleTextInput}
          className="w-full rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="H S% L%"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniPreview sub-component
// ---------------------------------------------------------------------------

interface MiniPreviewProps {
  colors: ThemeColors;
}

function MiniPreview({ colors }: MiniPreviewProps) {
  return (
    <div
      className="h-28 w-full overflow-hidden rounded-lg border border-border/50"
      style={{ backgroundColor: `hsl(${colors.background})` }}
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
        <span
          className="ml-2 truncate text-[9px]"
          style={{ color: `hsl(${colors.cardForeground})` }}
        >
          AGI Workforce
        </span>
      </div>
      <div className="flex gap-1.5 px-2 pb-1.5 pt-1">
        <div
          className="flex w-10 flex-col gap-1 rounded-sm p-1"
          style={{ backgroundColor: `hsl(${colors.secondary})` }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1.5 rounded-sm"
              style={{ backgroundColor: `hsl(${colors.mutedForeground})` }}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div
            className="h-2 w-3/4 rounded-sm"
            style={{ backgroundColor: `hsl(${colors.foreground})` }}
          />
          <div
            className="h-2 w-1/2 rounded-sm"
            style={{ backgroundColor: `hsl(${colors.primary})` }}
          />
          <div
            className="h-2 w-2/3 rounded-sm"
            style={{ backgroundColor: `hsl(${colors.muted})` }}
          />
        </div>
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{
          backgroundColor: `hsl(${colors.card})`,
          borderTop: `1px solid hsl(${colors.border})`,
        }}
      >
        <div
          className="h-4 flex-1 rounded-sm"
          style={{ backgroundColor: `hsl(${colors.input})` }}
        />
        <div className="h-4 w-8 rounded-sm" style={{ backgroundColor: `hsl(${colors.primary})` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog component
// ---------------------------------------------------------------------------

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'card', label: 'Card' },
  { key: 'cardForeground', label: 'Card Foreground' },
  { key: 'primary', label: 'Primary' },
  { key: 'primaryForeground', label: 'Primary Foreground' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'secondaryForeground', label: 'Secondary Foreground' },
  { key: 'muted', label: 'Muted' },
  { key: 'mutedForeground', label: 'Muted Foreground' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentForeground', label: 'Accent Foreground' },
  { key: 'destructive', label: 'Destructive' },
  { key: 'destructiveForeground', label: 'Destructive Foreground' },
  { key: 'border', label: 'Border' },
  { key: 'input', label: 'Input' },
  { key: 'ring', label: 'Ring' },
];

export function ThemeEditorDialog({ onClose, onSaved }: ThemeEditorDialogProps) {
  const [name, setName] = useState('My Theme');
  const [variant, setVariant] = useState<'dark' | 'light'>('dark');
  const [author, setAuthor] = useState('');
  const [colors, setColors] = useState<ThemeColors>({ ...DEFAULT_COLORS });

  const handleColorChange = useCallback((key: keyof ThemeColors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Theme name is required');
      return;
    }

    const theme: ThemeDefinition = {
      id: nameToId(trimmedName),
      name: trimmedName,
      variant,
      colors,
      ...(author.trim() ? { author: author.trim() } : {}),
    };

    saveCustomTheme(theme);
    toast.success(`Theme "${theme.name}" created`);
    onSaved();
    onClose();
  }, [name, variant, author, colors, onSaved, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create theme"
    >
      <div className="flex h-[90vh] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Create Custom Theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: meta + preview */}
          <div className="flex w-56 shrink-0 flex-col gap-4 border-r border-border p-4">
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="My Theme"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Author</label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Variant</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVariant('dark')}
                    className={[
                      'flex flex-1 items-center justify-center gap-1.5 rounded border py-1.5 text-xs transition-colors',
                      variant === 'dark'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    ].join(' ')}
                  >
                    <Moon className="h-3 w-3" /> Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariant('light')}
                    className={[
                      'flex flex-1 items-center justify-center gap-1.5 rounded border py-1.5 text-xs transition-colors',
                      variant === 'light'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    ].join(' ')}
                  >
                    <Sun className="h-3 w-3" /> Light
                  </button>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">Preview</p>
              <MiniPreview colors={colors} />
            </div>

            <div className="mt-auto text-[10px] text-muted-foreground">
              ID: <span className="font-mono">{nameToId(name.trim() || 'my-theme')}</span>
            </div>
          </div>

          {/* Right: color fields */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <ColorField
                  key={key}
                  label={label}
                  fieldKey={key}
                  value={(colors[key] as string) ?? ''}
                  onChange={handleColorChange}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save Theme
          </button>
        </div>
      </div>
    </div>
  );
}
