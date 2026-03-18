'use client';

import React from 'react';
import { Palette } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useStyleStore, type ResponseStyle } from '@features/chat/stores/style-store';

const STYLES: { id: ResponseStyle; label: string; desc: string }[] = [
  { id: 'normal', label: 'Normal', desc: 'Default response style' },
  { id: 'formal', label: 'Formal', desc: 'Professional and precise' },
  { id: 'concise', label: 'Concise', desc: 'Short and direct' },
  { id: 'explanatory', label: 'Explanatory', desc: 'Detailed with examples' },
  { id: 'custom', label: 'Custom', desc: 'Your own instructions' },
];

export function StyleSelector() {
  const { style, customInstruction, setStyle, setCustomInstruction } = useStyleStore();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = style !== 'normal';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all',
          isActive
            ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
        aria-label="Response style"
        aria-expanded={open}
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {style === 'normal' ? 'Style' : STYLES.find((s) => s.id === style)?.label}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border/60 bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
          <div className="mb-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Response Style
          </div>
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStyle(s.id);
                if (s.id !== 'custom') setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                style === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
              )}
            >
              <div className="flex-1 text-left">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
              {style === s.id && <div className="h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}

          {style === 'custom' && (
            <div className="mt-2 px-2">
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Enter custom style instructions..."
                className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/30"
                rows={3}
                maxLength={500}
              />
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {customInstruction.length}/500
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
