'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Diamond,
  Image as ImageIcon,
  LayoutTemplate,
  MessageSquarePlus,
  Minus,
  MoveRight,
  Palette,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  Circle,
  Square,
  Sparkles,
  Table,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { useOverlayDialog } from '@features/chat/hooks/use-overlay-dialog';
import { normalizeEditInstruction } from '../artifact-edit-request';
import { DeckMenu, type DeckMenuItem } from './DeckMenu';
import { ChartDataEditor } from './ChartDataEditor';
import { SlideShapes } from './SlideShapes';
import { SlideTextEditor } from './SlideTextEditor';
import { SlideView } from './SlideView';
import { STARTER_CHART, chartFence, readEditableChart, serializeChart } from './chart-block';
import {
  appendToSlide,
  fenceBlock,
  insertSlide,
  joinEditedSlide,
  moveSlide,
  parseDeck,
  removeSlide,
  replaceShapesBlock,
  replaceSlide,
  replaceVisualBlock,
  serializeDeck,
  shapesSource,
  slideSegments,
  slideTitle,
  splitSlideForEditing,
  type DeckDocument,
} from './deck-model';
import { REWRITE_SLIDE_INSTRUCTION, buildSlideEditRequest } from './deck-request';
import {
  SHAPE_KINDS,
  SHAPE_LABELS,
  newShape,
  parseShapes,
  serializeShapes,
  type DeckShape,
  type ShapeKind,
} from './deck-shapes';
import { DECK_THEMES, resolveDeckTheme, themeMeta, type DeckTheme } from './deck-themes';
import {
  IMAGE_EMBED_FAILURE_COPY,
  ImageEmbedError,
  embedImageFile,
  imageMarkdown,
} from './image-embed';

export const DECK_TABLE_TEMPLATE = [
  '| Item | Detail | Owner |',
  '| --- | --- | --- |',
  '| First | What it is | Who |',
  '| Second | What it is | Who |',
].join('\n');

export const DECK_DIAGRAM_TEMPLATE = [
  'flowchart LR',
  '  A[Start] --> B{Decision}',
  '  B -->|Yes| C[Do it]',
  '  B -->|No| D[Rethink]',
].join('\n');

const NEW_SLIDE = '## New slide\n\n- First point\n- Second point';

const SHAPE_ICONS: Record<ShapeKind, typeof Square> = {
  rect: Square,
  'rounded-rect': RectangleHorizontal,
  oval: Circle,
  diamond: Diamond,
  line: Minus,
  arrow: MoveRight,
};

export interface PresentationWorkspaceProps {
  title: string;
  content: string;
  editable: boolean;
  handEdited: boolean;
  onSave: (content: string) => void;
  onRequestEdits?: (prompt: string) => boolean;
  onCommentSlide?: (slideIndex: number) => void;
  onCreateBrand?: (apply: (meta: Record<string, string>) => void) => void;
  brandThemes?: readonly { id: string; name: string; meta: Record<string, string> }[];
}

function ThemeSwatch({ theme }: { theme: DeckTheme }) {
  return (
    <span
      className="inline-flex h-4 w-6 shrink-0 overflow-hidden rounded-sm border border-[var(--chat-border)]"
      aria-hidden="true"
    >
      <span className="flex-1" style={{ background: theme.background }} />
      <span className="w-2" style={{ background: theme.accent }} />
    </span>
  );
}

export function PresentationWorkspace({
  title,
  content,
  editable,
  handEdited,
  onSave,
  onRequestEdits,
  onCommentSlide,
  onCreateBrand,
  brandThemes = [],
}: PresentationWorkspaceProps) {
  const deck = useMemo(() => parseDeck(content), [content]);
  const theme = useMemo(() => resolveDeckTheme(deck.meta), [deck.meta]);
  const total = deck.slides.length;
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(total - 1, 0));
  const [editSlide, setEditSlide] = useState<string | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [chartEdit, setChartEdit] = useState<{ start: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [presenting, setPresenting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presentRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditSlide(null);
    setChartEdit(null);
    setSelectedShape(null);
  }, [content]);

  useEffect(() => {
    if (asking) askInputRef.current?.focus();
  }, [asking]);

  const commit = useCallback(
    (next: DeckDocument) => {
      const serialized = serializeDeck(next);
      if (serialized !== content) onSave(serialized);
    },
    [content, onSave],
  );

  const slide = deck.slides[current] ?? '';
  const shownSlide = editSlide ?? slide;
  const editing = editSlide !== null;

  const startEditing = (selectShape: string | null = null) => {
    setEditSlide(slide);
    setEditKey((key) => key + 1);
    setSelectedShape(selectShape);
    setChartEdit(null);
  };

  const finishEditing = () => {
    if (editSlide === null) return;
    commit(replaceSlide(deck, current, editSlide));
    setEditSlide(null);
    setSelectedShape(null);
  };

  const cancelEditing = () => {
    setEditSlide(null);
    setSelectedShape(null);
  };

  const editedShapes = useMemo(() => {
    const source = shapesSource(shownSlide);
    return source ? parseShapes(source) : [];
  }, [shownSlide]);

  const updateShapes = (shapes: DeckShape[]) => {
    setEditSlide((draft) =>
      draft === null
        ? draft
        : replaceShapesBlock(draft, shapes.length > 0 ? serializeShapes(shapes) : null),
    );
  };

  const addShape = (kind: ShapeKind) => {
    const base = editSlide ?? slide;
    const source = shapesSource(base);
    const existing = source ? parseShapes(source) : [];
    const shape = newShape(kind, existing);
    const nextSlide = replaceShapesBlock(base, serializeShapes([...existing, shape]));
    setEditSlide(nextSlide);
    if (editSlide === null) setEditKey((key) => key + 1);
    setSelectedShape(shape.id);
  };

  const appendBlock = (block: string) => {
    commit(replaceSlide(deck, current, appendToSlide(slide, block)));
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await embedImageFile(file);
      appendBlock(imageMarkdown(file.name, dataUrl));
      toast.success('Image placed on the slide');
    } catch (error) {
      toast.error(
        error instanceof ImageEmbedError
          ? IMAGE_EMBED_FAILURE_COPY[error.failure]
          : 'That image could not be placed.',
      );
    }
  };

  const sendSlideRequest = (text: string) => {
    if (!onRequestEdits) return;
    const normalized = normalizeEditInstruction(text);
    if (!normalized) return;
    const sent = onRequestEdits(
      buildSlideEditRequest({
        title,
        slideIndex: current,
        slideCount: total,
        slide,
        instruction: normalized,
        ...(handEdited ? { currentDeck: content } : {}),
      }),
    );
    if (sent) {
      setAsking(false);
      setInstruction('');
    } else {
      toast.error('The change request was not sent. Try again.');
    }
  };

  const submitAsk = (event: FormEvent) => {
    event.preventDefault();
    sendSlideRequest(instruction);
  };

  const stopPresenting = useCallback(() => setPresenting(false), []);
  useOverlayDialog(presentRef, presenting, stopPresenting);

  useEffect(() => {
    if (!presenting) return;
    const node = presentRef.current;
    node?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (node?.requestFullscreen) void node.requestFullscreen().catch(() => undefined);
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [presenting]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(total - 1, next)));

  const themeItems: DeckMenuItem[] = [
    ...DECK_THEMES.map((candidate) => ({
      id: `theme-${candidate.id}`,
      label: candidate.name,
      group: 'Themes',
      checked: theme.id === candidate.id,
      leading: <ThemeSwatch theme={candidate} />,
      onSelect: () => commit({ ...deck, meta: themeMeta(deck.meta, candidate.id) }),
    })),
    ...brandThemes.map((brand) => {
      const resolved = resolveDeckTheme(brand.meta);
      return {
        id: `brand-${brand.id}`,
        label: brand.name,
        group: 'Your brands',
        checked: theme.id === 'custom' && deck.meta['name'] === brand.name,
        leading: <ThemeSwatch theme={resolved} />,
        onSelect: () =>
          commit({ ...deck, meta: { ...themeMeta(deck.meta, 'custom'), ...brand.meta } }),
      };
    }),
    ...(onCreateBrand
      ? [
          {
            id: 'brand-new',
            label: 'New brand',
            group: 'Your brands',
            icon: Plus,
            onSelect: () =>
              onCreateBrand((meta) =>
                commit({ ...deck, meta: { ...themeMeta(deck.meta, 'custom'), ...meta } }),
              ),
          },
        ]
      : []),
  ];

  const insertItems: DeckMenuItem[] = [
    {
      id: 'insert-image',
      label: 'Image',
      icon: ImageIcon,
      group: 'Insert',
      onSelect: () => fileInputRef.current?.click(),
    },
    {
      id: 'insert-table',
      label: 'Table',
      icon: Table,
      group: 'Insert',
      onSelect: () => appendBlock(DECK_TABLE_TEMPLATE),
    },
    {
      id: 'insert-chart',
      label: 'Chart',
      icon: BarChart3,
      group: 'Insert',
      onSelect: () => appendBlock(chartFence(STARTER_CHART)),
    },
    {
      id: 'insert-diagram',
      label: 'Diagram',
      icon: Waypoints,
      group: 'Insert',
      onSelect: () => appendBlock(fenceBlock('mermaid', DECK_DIAGRAM_TEMPLATE)),
    },
    ...SHAPE_KINDS.map((kind) => ({
      id: `insert-shape-${kind}`,
      label: SHAPE_LABELS[kind],
      icon: SHAPE_ICONS[kind],
      group: 'Shapes',
      onSelect: () => addShape(kind),
    })),
  ];

  const slideItems: DeckMenuItem[] = [
    {
      id: 'slide-add',
      label: 'New slide after this',
      icon: Plus,
      onSelect: () => {
        commit(insertSlide(deck, current, NEW_SLIDE));
        setIndex(current + 1);
      },
    },
    {
      id: 'slide-duplicate',
      label: 'Duplicate slide',
      icon: Copy,
      onSelect: () => {
        commit(insertSlide(deck, current, slide));
        setIndex(current + 1);
      },
    },
    {
      id: 'slide-move-back',
      label: 'Move earlier',
      icon: ArrowLeft,
      disabled: current === 0,
      onSelect: () => {
        commit(moveSlide(deck, current, current - 1));
        setIndex(current - 1);
      },
    },
    {
      id: 'slide-move-forward',
      label: 'Move later',
      icon: ArrowRight,
      disabled: current >= total - 1,
      onSelect: () => {
        commit(moveSlide(deck, current, current + 1));
        setIndex(current + 1);
      },
    },
    {
      id: 'slide-delete',
      label: 'Delete slide',
      icon: Trash2,
      disabled: total <= 1,
      onSelect: () => {
        commit(removeSlide(deck, current));
        setIndex(Math.max(0, current - 1));
        toast.message('Slide deleted. Restore the previous version to bring it back.');
      },
    },
  ];

  const charts = slideSegments(slide).filter((segment) => segment.kind === 'chart');
  const editingChart =
    chartEdit !== null
      ? slideSegments(slide).find(
          (segment) => segment.kind === 'chart' && segment.start === chartEdit.start,
        )
      : undefined;
  const editableChart =
    editingChart && editingChart.kind === 'chart' ? readEditableChart(editingChart.source) : null;

  const selected = editedShapes.find((shape) => shape.id === selectedShape) ?? null;

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        No slides found
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="presentation-workspace"
    >
      <div
        role="toolbar"
        aria-label="Presentation"
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/30 px-2 py-1 scrollbar-none"
      >
        {editing ? (
          <>
            <DeckMenu
              label="Shape"
              icon={Square}
              items={insertItems.filter((item) => item.group === 'Shapes')}
              testId="deck-shapes-menu"
            />
            <span className="flex-1" />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={cancelEditing}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="ms-1 text-xs">Cancel</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={finishEditing}
              data-testid="deck-finish-editing"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="ms-1 text-xs">Done</span>
            </Button>
          </>
        ) : (
          <>
            {editable ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => startEditing()}
                  data-testid="deck-edit-slide"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ms-1 text-xs">Edit slide</span>
                </Button>
                <DeckMenu
                  label="Theme"
                  icon={Palette}
                  items={themeItems}
                  testId="deck-theme-menu"
                />
                <DeckMenu
                  label="Insert"
                  icon={Plus}
                  items={insertItems}
                  testId="deck-insert-menu"
                />
                <DeckMenu
                  label="Slide"
                  icon={LayoutTemplate}
                  items={slideItems}
                  testId="deck-slide-menu"
                />
                {onRequestEdits ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 px-2', asking && 'bg-muted')}
                    onClick={() => setAsking((value) => !value)}
                    aria-pressed={asking}
                    data-testid="deck-ask-slide"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="ms-1 text-xs">Ask about slide</span>
                  </Button>
                ) : null}
              </>
            ) : null}
            {onCommentSlide ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => onCommentSlide(current)}
                aria-label={`Comment on slide ${current + 1}`}
                data-testid="deck-comment-slide"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPresenting(true)}
              aria-label="Present"
              data-testid="deck-present"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => {
          void onPickImage(event.target.files?.[0]);
          event.target.value = '';
        }}
        data-testid="deck-image-input"
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {asking && !editing ? (
            <form
              onSubmit={submitAsk}
              className="flex items-center gap-1 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1"
              aria-label={`Ask about slide ${current + 1}`}
            >
              <label htmlFor="deck-ask-input" className="sr-only">
                What should change on slide {current + 1}?
              </label>
              <input
                id="deck-ask-input"
                ref={askInputRef}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setAsking(false);
                  }
                }}
                placeholder={`What should change on slide ${current + 1}?`}
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:min-h-9"
              />
              <button
                type="button"
                onClick={() => sendSlideRequest(REWRITE_SLIDE_INSTRUCTION)}
                className="min-h-11 shrink-0 rounded-lg px-2.5 text-sm text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
                data-testid="deck-rewrite-slide"
              >
                Rewrite slide
              </button>
              <button
                type="submit"
                disabled={!normalizeEditInstruction(instruction)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 sm:h-8 sm:w-8"
                aria-label="Send the change request"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          ) : null}

          {editing ? (
            <SlideTextEditor
              key={editKey}
              value={splitSlideForEditing(editSlide ?? '').text}
              onChange={(text) =>
                setEditSlide((draft) =>
                  draft === null
                    ? draft
                    : joinEditedSlide(text, splitSlideForEditing(draft).visuals),
                )
              }
              theme={theme}
              index={current}
              overlay={
                <SlideShapes
                  shapes={editedShapes}
                  theme={theme}
                  editable
                  selectedId={selectedShape}
                  onSelect={setSelectedShape}
                  onChange={updateShapes}
                />
              }
            />
          ) : (
            <SlideView
              markdown={shownSlide}
              theme={theme}
              index={current}
              total={total}
              title={title}
              className="rounded-lg border border-border/40"
            />
          )}

          {editing && selected ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="deck-shape-bar">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                {SHAPE_LABELS[selected.kind]} label
                <input
                  value={selected.text}
                  onChange={(event) =>
                    updateShapes(
                      editedShapes.map((shape) =>
                        shape.id === selected.id ? { ...shape, text: event.target.value } : shape,
                      ),
                    )
                  }
                  className="h-11 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground sm:h-8"
                  data-testid="deck-shape-label"
                />
              </label>
              <span className="text-xs text-muted-foreground">Drag or use arrow keys to move</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => {
                  updateShapes(editedShapes.filter((shape) => shape.id !== selected.id));
                  setSelectedShape(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="ms-1 text-xs">Remove shape</span>
              </Button>
            </div>
          ) : null}

          {editable && !editing && charts.length > 0 && !editableChart ? (
            <div className="flex flex-wrap gap-2">
              {charts.map((chart, position) =>
                chart.kind === 'chart' ? (
                  <Button
                    key={chart.start}
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setChartEdit({ start: chart.start })}
                    data-testid="deck-edit-chart"
                  >
                    <BarChart3 className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                    Edit chart data{charts.length > 1 ? ` ${position + 1}` : ''}
                  </Button>
                ) : null,
              )}
            </div>
          ) : null}

          {editableChart && chartEdit ? (
            <ChartDataEditor
              initial={editableChart}
              onCancel={() => setChartEdit(null)}
              onRemove={() => {
                commit(
                  replaceSlide(deck, current, replaceVisualBlock(slide, chartEdit.start, null)),
                );
                setChartEdit(null);
              }}
              onApply={(chart) => {
                commit(
                  replaceSlide(
                    deck,
                    current,
                    replaceVisualBlock(
                      slide,
                      chartEdit.start,
                      fenceBlock('chart', serializeChart(chart)),
                    ),
                  ),
                );
                setChartEdit(null);
              }}
            />
          ) : null}

          <nav aria-label="Slides" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(current - 1)}
              disabled={current === 0 || editing}
              aria-label="Previous slide"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] disabled:opacity-30 sm:h-8 sm:w-8"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <ol
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
              data-testid="deck-thumbnails"
            >
              {deck.slides.map((candidate, position) => (
                <li key={position} className="w-28 shrink-0">
                  <button
                    type="button"
                    onClick={() => go(position)}
                    disabled={editing}
                    aria-current={position === current ? 'true' : undefined}
                    aria-label={`Slide ${position + 1}: ${slideTitle(candidate, position)}`}
                    className={cn(
                      'block w-full overflow-hidden rounded-md border-2 transition-colors disabled:cursor-not-allowed',
                      position === current
                        ? 'border-[var(--chat-accent-primary)]'
                        : 'border-transparent hover:border-[var(--chat-border-strong)]',
                    )}
                  >
                    <SlideView
                      markdown={candidate}
                      theme={theme}
                      index={position}
                      total={total}
                      interactive={false}
                      thumbnail
                    />
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => go(current + 1)}
              disabled={current >= total - 1 || editing}
              aria-label="Next slide"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] disabled:opacity-30 sm:h-8 sm:w-8"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>

      {presenting ? (
        <div
          ref={presentRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Presenting ${title}`}
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-background outline-none"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
              event.preventDefault();
              go(current + 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
              event.preventDefault();
              go(current - 1);
            }
          }}
          onClick={() => go(current + 1)}
          data-testid="deck-presenting"
        >
          <div className="w-full max-w-[calc(100vh*16/9)]">
            <SlideView markdown={slide} theme={theme} index={current} total={total} title={title} />
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPresenting(false);
            }}
            className="absolute end-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-[var(--chat-surface-hover)]"
            aria-label="Stop presenting"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
