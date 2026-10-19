'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useConfirmAction,
} from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import {
  DECK_FONT_LABELS,
  DEFAULT_DECK_THEME,
  brandThemeMeta,
  contrastRatio,
  resolveDeckTheme,
  type DeckFont,
} from '../presentation/deck-themes';
import {
  deleteStudioLibraryItem,
  saveStudioLibraryItem,
  useStudioLibrary,
  type BrandPayload,
  type StudioLibraryItem,
} from './studio-library-client';

const FIELD =
  'min-h-11 w-full rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9';
const FONTS: DeckFont[] = ['sans', 'serif', 'mono'];

export function SaveTemplateDialog({
  open,
  onOpenChange,
  kind,
  defaultName,
  content,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'document_template' | 'deck_template';
  defaultName: string;
  content: string;
  title: string;
}) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const id = useId();
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await saveStudioLibraryItem({ kind, name: name.trim(), payload: { title, content } });
      toast.success('Saved as a template. Find it under New from template.');
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error, 'The template was not saved'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="save-template-dialog">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Start new {kind === 'deck_template' ? 'decks' : 'documents'} from this one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <label htmlFor={id} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Template name
            <input
              id={id}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || saving}
              data-testid="save-template-submit"
            >
              Save template
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandKitDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (item: StudioLibraryItem) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState<BrandPayload>({
    background: DEFAULT_DECK_THEME.background,
    text: DEFAULT_DECK_THEME.text,
    accent: DEFAULT_DECK_THEME.accent,
    headingFont: 'sans',
    bodyFont: 'sans',
    voice: '',
  });
  const [saving, setSaving] = useState(false);
  const preview = useMemo(
    () => resolveDeckTheme(brandThemeMeta({ name: name || 'Brand', ...brand })),
    [brand, name],
  );
  const textAdjusted = preview.text !== brand.text.toLowerCase();
  const accentAdjusted = preview.accent !== brand.accent.toLowerCase();
  const set = <K extends keyof BrandPayload>(key: K, value: BrandPayload[K]) =>
    setBrand((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const item = await saveStudioLibraryItem({
        kind: 'brand',
        name: name.trim(),
        payload: brand,
      });
      toast.success(`Saved the ${name.trim()} brand`);
      onSaved?.(item);
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error, 'The brand was not saved'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="brand-kit-dialog">
        <DialogHeader>
          <DialogTitle>New brand</DialogTitle>
          <DialogDescription>
            Colours, fonts and voice to apply to decks and documents.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Brand name
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['background', 'text', 'accent'] as const).map((key) => (
              <label
                key={key}
                className="flex flex-col gap-1 text-xs capitalize text-muted-foreground"
              >
                {key}
                <input
                  type="color"
                  value={brand[key]}
                  onChange={(event) => set(key, event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-md border border-border/60 bg-background sm:h-9"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['headingFont', 'bodyFont'] as const).map((key) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {key === 'headingFont' ? 'Heading font' : 'Body font'}
                <select
                  value={brand[key]}
                  onChange={(event) => set(key, event.target.value as DeckFont)}
                  className={FIELD}
                >
                  {FONTS.map((font) => (
                    <option key={font} value={font}>
                      {DECK_FONT_LABELS[font]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Voice
            <textarea
              rows={2}
              value={brand.voice}
              maxLength={2_000}
              onChange={(event) => set('voice', event.target.value)}
              placeholder="Warm and direct, short sentences, no jargon"
              className={`${FIELD} py-2`}
            />
          </label>
          {textAdjusted || accentAdjusted ? (
            <p className="text-xs text-muted-foreground" role="status">
              {textAdjusted
                ? `The text colour is too faint on this background (${contrastRatio(brand.text, brand.background).toFixed(1)}:1), so decks use a readable one instead.`
                : 'The accent is too faint on this background, so decks use the text colour for it.'}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving} data-testid="brand-kit-submit">
              Save brand
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const KIND_LABELS: Record<StudioLibraryItem['kind'], string> = {
  document_template: 'Document templates',
  deck_template: 'Deck templates',
  brand: 'Brands',
};

export function LibraryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { items, state, load } = useStudioLibrary();
  const { confirm, dialog } = useConfirmAction();
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="library-manager-dialog">
        <DialogHeader>
          <DialogTitle>Templates and brands</DialogTitle>
          <DialogDescription>What you saved to start new work from.</DialogDescription>
        </DialogHeader>
        {state.status === 'failed' ? (
          <p className="text-sm text-muted-foreground" role="status">
            Your templates could not be loaded.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing saved yet. Use Save as template on a document or deck, or New brand in a deck’s
            Theme menu.
          </p>
        ) : (
          (['document_template', 'deck_template', 'brand'] as const).map((kind) => {
            const group = items.filter((item) => item.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">{KIND_LABELS[kind]}</h3>
                <ul className="flex flex-col">
                  {group.map((item) => (
                    <li
                      key={item.id}
                      className="flex min-h-11 items-center gap-2 text-sm text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <button
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        onClick={() =>
                          confirm({
                            title: `Delete ${item.name}?`,
                            description:
                              'It is removed from your saved templates and brands for good. Documents and decks already made from it keep their content.',
                            confirmLabel: 'Delete',
                            destructive: true,
                            onConfirm: () =>
                              void deleteStudioLibraryItem(item.id).catch((error: unknown) =>
                                toast.error(toUserMessage(error, 'That was not deleted')),
                              ),
                          })
                        }
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-8 sm:w-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
        {dialog}
      </DialogContent>
    </Dialog>
  );
}
