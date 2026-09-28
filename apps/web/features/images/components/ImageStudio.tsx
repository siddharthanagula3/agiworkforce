'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Download, ImagePlus, Pencil, Wand2, X } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import {
  LibraryListResponseSchema,
  MANAGED_MEDIA_MAX_IMAGE_REFERENCES,
  type LibraryItem,
} from '@agiworkforce/cloud-contracts';
import { useCapability } from '@agiworkforce/unified-chat/capabilities';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { PENDING_CONVERSATION_KEY, useChatStore } from '@shared/stores/web-chat-store';
import { useMediaModelAvailability } from '@features/chat/hooks/use-media-model-availability';
import {
  IMAGE_MODELS,
  IMAGE_STYLE_PRESETS,
  getImageAspectOptionsForModel,
  readImageFileAsBase64,
  readReferenceImageAsBase64,
  resolveImageGenerationRequestOptions,
  type ImageAspectRatio,
  type ImageEditRequest,
} from '@features/chat/lib/imageGenerationOptions';
import { readImageAspectRatio } from '@features/library/lib/library-chat-handoff';
import {
  IMAGE_GENERATION_CANCELLED_CODE,
  MediaGenerationApiError,
  cancelImageGenerations,
  useMediaGeneration,
} from '@/lib/hooks/useMediaGeneration';
import { toUserMessage } from '@/lib/user-error-message';
import { cn } from '@shared/lib/utils';

const IMAGE_STUDIO_SCOPE = 'image-studio';
const HISTORY_PAGE_SIZE = 48;
const MAX_ATTACHED_IMAGES = MANAGED_MEDIA_MAX_IMAGE_REFERENCES + 1;

interface StudioImage {
  key: string;
  url: string;
  fileName: string;
  prompt: string | null;
  model: string | null;
}

function fromLibraryItem(item: LibraryItem): StudioImage {
  return {
    key: item.id,
    url: item.uri,
    fileName: item.file_name,
    prompt: item.prompt,
    model: item.model,
  };
}

async function imageFile(image: StudioImage): Promise<File> {
  const response = await fetch(image.url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('That image could not be loaded.');
  const blob = await response.blob();
  return new File([blob], image.fileName, { type: blob.type || 'image/png' });
}

export function ImageStudio() {
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { generateImage } = useMediaGeneration();
  const { status: availabilityStatus, admissionFor } = useMediaModelAvailability();
  const canUseImages = useCapability('canUseImages');
  const billingReady = useBillingStore(isBillingPolicyReady);
  const setComposerToggles = useChatStore((s) => s.setComposerToggles);

  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('auto');
  const [files, setFiles] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<StudioImage[]>([]);
  const [history, setHistory] = useState<StudioImage[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const canGenerate = billingReady && canUseImages;
  const models = useMemo(
    () =>
      availabilityStatus === 'ready'
        ? IMAGE_MODELS.filter((model) => admissionFor(model.id)?.state === 'enabled')
        : [],
    [admissionFor, availabilityStatus],
  );
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];
  const aspectOptions = useMemo(
    () => getImageAspectOptionsForModel(selectedModel?.id),
    [selectedModel?.id],
  );
  const effectiveAspect = aspectOptions.some((option) => option.id === aspectRatio)
    ? aspectRatio
    : 'auto';
  const supportsEdit = selectedModel
    ? admissionFor(selectedModel.id)?.supports_edit === true
    : false;
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const loadHistory = useCallback(async (offset: number) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        kind: 'image',
        limit: String(HISTORY_PAGE_SIZE),
        offset: String(offset),
      });
      const response = await fetch(`/api/library?${params.toString()}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const page = LibraryListResponseSchema.parse(await response.json());
      const images = page.items.map(fromLibraryItem);
      setHistory((current) => (offset === 0 ? images : [...current, ...images]));
      setNextOffset(page.next_offset);
      setHistoryError(null);
    } catch {
      setHistoryError('Your images could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(0);
  }, [loadHistory]);

  const shownImages = useMemo(() => {
    const saved = new Set(history.map((image) => image.url));
    return [...created.filter((image) => !saved.has(image.url)), ...history];
  }, [created, history]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const images = Array.from(incoming).filter((file) => file.type.startsWith('image/'));
    const next = [...files, ...images];
    setNotice(
      next.length > MAX_ATTACHED_IMAGES
        ? `Attach up to ${MAX_ATTACHED_IMAGES} images: the first is edited and the others guide it.`
        : null,
    );
    setFiles(next.slice(0, MAX_ATTACHED_IMAGES));
  };

  const applyStyle = (phrase: string) => {
    setPrompt((current) => (current.trim() ? `${current.trim()}, ${phrase}` : phrase));
    promptRef.current?.focus();
  };

  const remix = async (image: StudioImage) => {
    setError(null);
    setPrompt(image.prompt ?? '');
    if (image.model && models.some((model) => model.id === image.model)) setModelId(image.model);
    try {
      setAspectRatio((await readImageAspectRatio(await imageFile(image))) ?? 'auto');
    } catch {
      setAspectRatio('auto');
    }
    promptRef.current?.focus();
  };

  const edit = async (image: StudioImage) => {
    setError(null);
    try {
      setFiles([await imageFile(image)]);
      setPrompt('');
      promptRef.current?.focus();
    } catch (cause) {
      setError(toUserMessage(cause, 'That image could not be loaded for editing.'));
    }
  };

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || generating || !selectedModel) return;
    if (files.length > 0 && !supportsEdit) {
      setError(
        'This model cannot edit an attached image. Choose a model that can, or remove the images.',
      );
      return;
    }
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      let editRequest: ImageEditRequest | undefined;
      const [source, ...references] = files;
      if (source) {
        const [sourceImageBase64, referenceImagesBase64] = await Promise.all([
          readImageFileAsBase64(source),
          Promise.all(references.map(readReferenceImageAsBase64)),
        ]);
        editRequest = {
          operation: 'edit',
          sourceImageBase64,
          ...(referenceImagesBase64.length > 0 ? { referenceImagesBase64 } : {}),
        };
      }
      const request = resolveImageGenerationRequestOptions(
        effectiveAspect,
        selectedModel.id,
        editRequest,
      );
      const result = await generateImage(text, { ...request, cancelScope: IMAGE_STUDIO_SCOPE });
      setCreated((current) => [
        {
          key: result.imageUrl,
          url: result.imageUrl,
          fileName: 'image.png',
          prompt: text,
          model: result.model,
        },
        ...current,
      ]);
      setFiles([]);
      void loadHistory(0);
    } catch (cause) {
      if (
        cause instanceof MediaGenerationApiError &&
        cause.code === IMAGE_GENERATION_CANCELLED_CODE
      ) {
        setNotice('You stopped this image.');
      } else {
        setError(toUserMessage(cause, 'The image could not be created. Try again.'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const openInChat = () => {
    setComposerToggles(
      { workMode: 'chat', imageMode: true, videoMode: false },
      PENDING_CONVERSATION_KEY,
    );
    router.push('/chat');
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Images</h1>
        <p className="text-sm text-muted-foreground">
          Describe an image, pick a style and shape, and find everything you have made below.
        </p>
      </header>

      {billingReady && !canGenerate ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Your plan does not include image generation here. Any free image models you have are in
            chat.
          </p>
          <Button variant="outline" size="sm" onClick={openInChat}>
            Open image mode in chat
          </Button>
        </section>
      ) : (
        <form
          onSubmit={(event) => void handleGenerate(event)}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <label htmlFor="image-studio-prompt" className="sr-only">
            Describe the image
          </label>
          <textarea
            id="image-studio-prompt"
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
            placeholder={files.length > 0 ? 'Describe the change' : 'Describe an image'}
            className="w-full resize-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />

          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Attached images">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="relative">
                  <img
                    src={previews[index]}
                    alt={index === 0 ? 'Image to edit' : `Guide image ${index}`}
                    className="h-16 w-16 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground pointer-coarse:h-7 pointer-coarse:w-7"
                    aria-label={`Remove ${index === 0 ? 'the image to edit' : `guide image ${index}`}`}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {files.length > 1 ? (
                <li className="self-center text-xs text-muted-foreground">
                  {`The first image is edited, guided by the other ${files.length - 1}.`}
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Attach images"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={generating || files.length >= MAX_ATTACHED_IMAGES}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              <span className="ms-1">Add image</span>
            </Button>

            {models.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" aria-label="Choose image model">
                    {selectedModel?.label}
                    <ChevronDown className="ms-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {models.map((model) => (
                    <DropdownMenuItem key={model.id} onClick={() => setModelId(model.id)}>
                      <span className="flex-1">{model.label}</span>
                      {model.id === selectedModel?.id ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {aspectOptions.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Choose aspect ratio"
                  >
                    {aspectOptions.find((option) => option.id === effectiveAspect)?.label ?? 'Auto'}
                    <ChevronDown className="ms-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {aspectOptions.map((option) => (
                    <DropdownMenuItem key={option.id} onClick={() => setAspectRatio(option.id)}>
                      <span className="flex-1">{option.label}</span>
                      {option.id === effectiveAspect ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Add a style to the prompt"
                >
                  Style
                  <ChevronDown className="ms-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {IMAGE_STYLE_PRESETS.map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => applyStyle(preset.phrase)}>
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{preset.label}</span>
                      <span className="text-xs text-muted-foreground">{preset.phrase}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ms-auto flex items-center gap-2">
              {generating ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cancelImageGenerations(IMAGE_STUDIO_SCOPE)}
                >
                  Stop
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={!prompt.trim() || generating || !selectedModel}
                isLoading={generating}
              >
                {files.length > 0 ? 'Edit' : 'Create'}
              </Button>
            </div>
          </div>

          {availabilityStatus === 'ready' && models.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              No image model is available right now.
            </p>
          ) : null}
          {notice ? (
            <p className="text-sm text-muted-foreground" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--chat-destructive-text)]" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}

      <section aria-labelledby="image-studio-history" className="flex flex-col gap-3">
        <h2 id="image-studio-history" className="text-base font-semibold text-foreground">
          Your images
        </h2>
        {generating ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner size="sm" aria-hidden="true" />
            Creating your image…
          </div>
        ) : null}
        {historyError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground" role="alert">
            {historyError}
            <Button variant="outline" size="sm" onClick={() => void loadHistory(0)}>
              Retry
            </Button>
          </div>
        ) : null}
        {!historyLoading && !historyError && shownImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Images you create appear here.</p>
        ) : null}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shownImages.map((image) => (
            <li
              key={image.key}
              className="group relative overflow-hidden rounded-xl border border-border bg-muted/30"
            >
              <img
                src={image.url}
                alt={image.prompt || image.fileName}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/90 p-1.5',
                  'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100',
                )}
              >
                <button
                  type="button"
                  onClick={() => void remix(image)}
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-foreground hover:bg-muted pointer-coarse:h-11"
                  aria-label="Remix this image"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remix
                </button>
                <button
                  type="button"
                  onClick={() => void edit(image)}
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-foreground hover:bg-muted pointer-coarse:h-11"
                  aria-label="Edit this image"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <a
                  href={image.url}
                  download={image.fileName}
                  className="ms-auto flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-muted pointer-coarse:h-11 pointer-coarse:w-11"
                  aria-label="Download this image"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
        {historyLoading ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : nextOffset !== null ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void loadHistory(nextOffset)}>
              Show more
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
