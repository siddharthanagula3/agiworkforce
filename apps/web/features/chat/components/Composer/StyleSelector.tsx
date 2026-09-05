'use client';

import React from 'react';
import {
  Palette,
  Minus,
  BookOpen,
  Code2,
  Sparkles,
  LayoutList,
  Plus,
  Trash2,
  Check,
  X,
} from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';
import {
  useStyleStore,
  DEFAULT_PRESET_STYLE,
  RESPONSE_LENGTH_OPTIONS,
  type PresetStyle,
  type CustomStyle,
} from '@features/chat/stores/style-store';

const STYLES: { id: PresetStyle; label: string; desc: string; icon: React.ElementType }[] = [
  { id: 'default', label: 'Default', desc: 'Standard response style', icon: Minus },
  { id: 'concise', label: 'Concise', desc: 'Brief and direct', icon: LayoutList },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough with examples', icon: BookOpen },
  { id: 'technical', label: 'Technical', desc: 'Precise with code examples', icon: Code2 },
  { id: 'creative', label: 'Creative', desc: 'Expressive and engaging', icon: Sparkles },
];

interface CreateFormState {
  name: string;
  sampleText: string;
  instruction: string;
}

const EMPTY_FORM: CreateFormState = { name: '', sampleText: '', instruction: '' };

export function StyleSelector() {
  const {
    style,
    length,
    activeCustomStyleId,
    customStyles,
    setStyle,
    setLength,
    setActiveCustomStyle,
    addCustomStyle,
    deleteCustomStyle,
  } = useStyleStore();
  const [open, setOpen] = React.useState(false);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [form, setForm] = React.useState<CreateFormState>(EMPTY_FORM);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setShowCreateForm(false);
      setForm(EMPTY_FORM);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = style !== DEFAULT_PRESET_STYLE || length !== 'brief';

  const activeLabel = React.useMemo<string>(() => {
    if (style === 'custom') {
      const found = customStyles.find((s) => s.id === activeCustomStyleId);
      return found?.name ?? 'Custom';
    }
    return STYLES.find((s) => s.id === (style as PresetStyle))?.label ?? 'Style';
  }, [style, activeCustomStyleId, customStyles]);

  function handleSelectPreset(id: PresetStyle) {
    setStyle(id);
    setOpen(false);
    setShowCreateForm(false);
  }

  function handleSelectCustom(custom: CustomStyle) {
    setActiveCustomStyle(custom.id);
    setOpen(false);
    setShowCreateForm(false);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteCustomStyle(id);
  }

  function handleSampleChange(value: string) {
    setForm((prev) => {
      const hasInstruction = prev.instruction.trim().length > 0;
      const autoInstruction =
        !hasInstruction && value.trim().length > 20
          ? 'Match the tone, vocabulary, and sentence structure of my writing sample.'
          : prev.instruction;
      return { ...prev, sampleText: value, instruction: autoInstruction };
    });
  }

  function handleSave() {
    const name = form.name.trim();
    const instruction = form.instruction.trim();
    const sampleText = form.sampleText.trim();
    if (!name || !instruction) return;
    addCustomStyle(name, instruction, sampleText);
    setShowCreateForm(false);
    setForm(EMPTY_FORM);
    setOpen(false);
  }

  function handleCancelCreate() {
    setShowCreateForm(false);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="relative" ref={ref}>
      {/* An ordinary row of the "+" menu, not a composer-face pill: as a pill
          it rendered indented, smaller and muted beside Skills and Connectors,
          and its label was dropped entirely on a narrow composer, leaving a
          bare icon with no name. */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
          isActive && 'text-[var(--chat-accent-primary-text)]',
        )}
        aria-label="Response style"
        aria-expanded={open}
      >
        <Palette className={cn('h-4 w-4', !isActive && 'text-muted-foreground')} />
        <span className="flex-1 text-left">Style</span>
        {isActive && <span className="text-[12px] font-medium">{activeLabel}</span>}
      </button>

      {/* Portaled + viewport-clamped: as an `absolute bottom-full` panel this
          468px menu opened at y=-64 on the empty-chat screen (the composer is
          centred INSIDE the shell's overflow-hidden column there), which put
          "Default" and "Concise" outside the clip rect and made them
          unclickable. See AnchoredComposerMenu. */}
      <AnchoredComposerMenu
        anchorRef={triggerRef}
        open={open}
        align="start"
        contentRef={panelRef}
        label="Response style"
        onRequestClose={() => setOpen(false)}
        className="w-72 p-2"
      >
        <div>
          {/* Preset styles */}
          <div className="mb-1.5 px-2 py-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Response Style
          </div>
          {STYLES.map((s) => {
            const Icon = s.icon;
            const isSelected = style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSelectPreset(s.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 text-left">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
                {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
              </button>
            );
          })}

          {/* Divider */}
          <div className="my-2 border-t border-border/40" />

          {/* Response length · AUDIT-FIX CMP-6/CMP-7. Orthogonal to style: this
              is the verbosity axis the surface previously had no control for. */}
          <div className="mb-1.5 px-2 py-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Response Length
          </div>
          <div
            className="mb-1 flex items-center gap-1 px-1"
            role="group"
            aria-label="Response length"
          >
            {RESPONSE_LENGTH_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLength(option.id)}
                aria-pressed={length === option.id}
                title={option.desc}
                className={cn(
                  'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  length === option.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-border/40" />

          {/* Custom styles section */}
          <div className="mb-1.5 px-2 py-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Custom Styles
          </div>

          {customStyles.length > 0 && (
            <div className="mb-1 space-y-0.5">
              {customStyles.map((custom) => {
                const isSelected = style === 'custom' && activeCustomStyleId === custom.id;
                return (
                  <button
                    key={custom.id}
                    onClick={() => handleSelectCustom(custom)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                    )}
                  >
                    <Palette className="h-4 w-4 shrink-0 opacity-60" />
                    <div className="flex-1 truncate text-left">
                      <div className="truncate font-medium">{custom.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {custom.instruction}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDelete(e, custom.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          handleDelete(e as unknown as React.MouseEvent, custom.id);
                      }}
                      className={cn(
                        'ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-danger group-hover:opacity-100',
                        isSelected && 'opacity-100',
                      )}
                      aria-label={`Delete ${custom.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                    {isSelected && <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Create custom style */}
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              <span>Create Custom Style</span>
            </button>
          ) : (
            <div className="mt-1 space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="text-xs font-medium text-foreground">New Custom Style</div>

              {/* Name */}
              <input
                type="text"
                placeholder="Style name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />

              {/* Writing sample */}
              <textarea
                placeholder="Paste a writing sample and we'll match its tone..."
                value={form.sampleText}
                onChange={(e) => handleSampleChange(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />

              {/* Instruction */}
              <textarea
                placeholder="Style instruction (e.g. 'Write like a pirate')"
                value={form.instruction}
                onChange={(e) => setForm((prev) => ({ ...prev, instruction: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim() || !form.instruction.trim()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  onClick={handleCancelCreate}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </AnchoredComposerMenu>
    </div>
  );
}
