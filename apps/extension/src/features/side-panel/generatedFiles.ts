import type { GeneratedFileWire } from '@agiworkforce/cloud-contracts';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { formatBytes } from '@agiworkforce/utils/format';
import {
  renderIcon,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
} from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';
import { buildImageViewerButton, closeImageViewer } from './mediaViewer';

export interface AnswerFile {
  key: string;
  name: string;
  mimeType: string;
  byteCount?: number;
  uri: string;
  surface: 'artifact' | 'file';
}

export interface AnswerFileAccess {
  resolveUrl: (uri: string) => string | null;
  fetchFile: (url: string) => Promise<Blob>;
  openUrl: (url: string) => void;
}

const INLINE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_CACHED_IMAGES = 24;
const imageDataUrlCache = new Map<string, Promise<string>>();
const INLINE_VIDEO_TYPES: ReadonlySet<string> = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const MAX_CACHED_VIDEOS = 4;
interface VideoResource {
  blob: Promise<Blob>;
  users: number;
  epoch: number;
  objectUrl?: string;
}
interface VideoUrlLease {
  url: Promise<string>;
  current(): boolean;
  release(): void;
}
const videoBlobCache = new Map<string, VideoResource>();
const activeVideoResources = new Map<string, VideoResource>();
const videoViews = new WeakMap<Element, { mount(): void; unmount(): void }>();
let videoViewObserver: MutationObserver | undefined;
let previewEpoch = 0;
const SAVED_FILE_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function answerFiles(
  generatedFiles: readonly GeneratedFileWire[] | undefined,
  activity: AgentActivityState | undefined,
): AnswerFile[] {
  const files: AnswerFile[] = [];
  const seen = new Set<string>();
  for (const file of generatedFiles ?? []) {
    if (seen.has(file.uri)) continue;
    seen.add(file.uri);
    files.push({
      key: file.id,
      name: file.file_name,
      mimeType: file.mime_type,
      byteCount: file.byte_count,
      uri: file.uri,
      surface: file.surface,
    });
  }
  for (const entry of activity?.entries ?? []) {
    if (entry.kind !== 'artifact' || seen.has(entry.uri)) continue;
    seen.add(entry.uri);
    files.push({
      key: entry.artifactId,
      name: entry.name,
      mimeType: entry.mimeType,
      ...(entry.sizeBytes !== undefined ? { byteCount: entry.sizeBytes } : {}),
      uri: entry.uri,
      surface: 'artifact',
    });
  }
  return files;
}

function isInlineImage(file: AnswerFile): boolean {
  return (
    INLINE_IMAGE_TYPES.has(file.mimeType.toLowerCase()) &&
    (file.byteCount === undefined || file.byteCount <= INLINE_IMAGE_MAX_BYTES)
  );
}

function isInlineVideo(file: AnswerFile): boolean {
  return INLINE_VIDEO_TYPES.has(file.mimeType.toLowerCase());
}

function fileTypeLabel(file: AnswerFile): string {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1];
  if (extension) return extension.toUpperCase();
  const subtype = file.mimeType.split('/')[1]?.split(/[+;]/)[0];
  return subtype ? subtype.toUpperCase() : t('spAnswerFileGenericType');
}

export function fileMetaLabel(file: AnswerFile): string {
  const type = fileTypeLabel(file);
  return file.byteCount ? `${type} · ${formatBytes(file.byteCount, 1)}` : type;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('unreadable image'));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable image'));
    reader.readAsDataURL(blob);
  });
}

export function loadImageDataUrl(url: string, access: AnswerFileAccess): Promise<string> {
  const cached = imageDataUrlCache.get(url);
  if (cached) return cached;
  const epoch = previewEpoch;
  const pending: Promise<string> = access
    .fetchFile(url)
    .then(async (blob) => {
      if (epoch !== previewEpoch) throw new Error('Preview context changed');
      if (!INLINE_IMAGE_TYPES.has(blob.type.toLowerCase())) throw new Error('not an image');
      const dataUrl = await readBlobAsDataUrl(blob);
      if (epoch !== previewEpoch) throw new Error('Preview context changed');
      return dataUrl;
    })
    .catch((error: unknown) => {
      if (imageDataUrlCache.get(url) === pending) imageDataUrlCache.delete(url);
      throw error;
    });
  imageDataUrlCache.set(url, pending);
  while (imageDataUrlCache.size > MAX_CACHED_IMAGES) {
    const oldest = imageDataUrlCache.keys().next().value;
    if (oldest === undefined) break;
    imageDataUrlCache.delete(oldest);
  }
  return pending;
}

export function saveBlob(name: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = el('a', { href: objectUrl, download: name });
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function savedFileName(name: string, blobType: string): string {
  if (/\.[a-z0-9]{1,8}$/i.test(name)) return name;
  const extension = SAVED_FILE_EXTENSION[blobType.toLowerCase()];
  return extension ? `${name}.${extension}` : name;
}

export async function saveAnswerFile(
  url: string,
  name: string,
  access: AnswerFileAccess,
): Promise<void> {
  const blob = await access.fetchFile(url);
  saveBlob(savedFileName(name, blob.type), blob);
}

function acquireVideoObjectUrl(url: string, access: AnswerFileAccess): VideoUrlLease {
  let resource = activeVideoResources.get(url) ?? videoBlobCache.get(url);
  if (!resource) {
    const epoch = previewEpoch;
    const pending: Promise<Blob> = Promise.resolve()
      .then(() => access.fetchFile(url))
      .then((blob) => {
        if (epoch !== previewEpoch) throw new Error('Preview context changed');
        if (!INLINE_VIDEO_TYPES.has(blob.type.toLowerCase())) throw new Error('not a video');
        return blob;
      })
      .catch((error: unknown) => {
        if (videoBlobCache.get(url)?.blob === pending) videoBlobCache.delete(url);
        if (activeVideoResources.get(url)?.blob === pending) activeVideoResources.delete(url);
        throw error;
      });
    resource = { blob: pending, users: 0, epoch };
  }
  const owned = resource;
  owned.users += 1;
  activeVideoResources.set(url, owned);
  videoBlobCache.delete(url);
  videoBlobCache.set(url, owned);
  while (videoBlobCache.size > MAX_CACHED_VIDEOS) {
    const oldest = videoBlobCache.keys().next();
    if (oldest.done) break;
    videoBlobCache.delete(oldest.value);
  }
  let released = false;
  const current = (): boolean => !released && owned.epoch === previewEpoch;
  return {
    current,
    url: owned.blob.then((blob) => {
      if (!current()) throw new Error('Preview was released');
      owned.objectUrl ??= URL.createObjectURL(blob);
      return owned.objectUrl;
    }),
    release() {
      if (released) return;
      released = true;
      owned.users -= 1;
      if (owned.users !== 0) return;
      if (activeVideoResources.get(url) === owned) activeVideoResources.delete(url);
      if (owned.objectUrl) URL.revokeObjectURL(owned.objectUrl);
      delete owned.objectUrl;
    },
  };
}

function visitVideoViews(node: Node, action: 'mount' | 'unmount'): void {
  if (!(node instanceof Element)) return;
  if (action === 'mount' || !node.isConnected) videoViews.get(node)?.[action]();
  for (const figure of node.querySelectorAll('.sp-answer-video')) {
    if (action === 'mount' || !figure.isConnected) videoViews.get(figure)?.[action]();
  }
}

function observeVideoViews(): void {
  if (videoViewObserver) return;
  videoViewObserver = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) visitVideoViews(node, 'mount');
    for (const record of records)
      for (const node of record.removedNodes) visitVideoViews(node, 'unmount');
  });
  videoViewObserver.observe(document.documentElement, { childList: true, subtree: true });
}

export function clearAnswerFilePreviews(): void {
  previewEpoch += 1;
  closeImageViewer();
  imageDataUrlCache.clear();
  for (const figure of document.querySelectorAll('.sp-answer-video'))
    videoViews.get(figure)?.unmount();
  for (const resource of activeVideoResources.values()) {
    if (resource.objectUrl) URL.revokeObjectURL(resource.objectUrl);
    delete resource.objectUrl;
  }
  activeVideoResources.clear();
  videoBlobCache.clear();
}

function buildFileActions(
  file: AnswerFile,
  url: string,
  access: AnswerFileAccess,
  status: HTMLElement,
): HTMLElement {
  const actions = el('span', { class: 'sp-answer-file__actions' });
  const open = el('button', {
    class: 'sp-answer-file__action',
    type: 'button',
    'aria-label': t('spAnswerFileOpen', [file.name]),
    title: t('spAnswerFileOpen', [file.name]),
  });
  open.appendChild(renderIcon(ExternalLink, 14));
  open.addEventListener('click', () => access.openUrl(url));
  const download = el('button', {
    class: 'sp-answer-file__action',
    type: 'button',
    'aria-label': t('spAnswerFileDownload', [file.name]),
    title: t('spAnswerFileDownload', [file.name]),
  }) as HTMLButtonElement;
  download.appendChild(renderIcon(Download, 14));
  download.addEventListener('click', () => {
    download.disabled = true;
    download.setAttribute('aria-busy', 'true');
    status.textContent = t('spAnswerFileDownloading', [file.name]);
    saveAnswerFile(url, file.name, access)
      .then(() => {
        status.textContent = '';
      })
      .catch(() => {
        status.textContent = t('spAnswerFileDownloadFailed', [file.name]);
      })
      .finally(() => {
        download.disabled = false;
        download.removeAttribute('aria-busy');
      });
  });
  actions.appendChild(open);
  actions.appendChild(download);
  return actions;
}

function buildFileCard(file: AnswerFile, access: AnswerFileAccess): HTMLElement {
  const card = el('div', {
    class: 'sp-answer-file',
    role: 'listitem',
    'data-surface': file.surface,
  });
  const icon = el('span', { class: 'sp-answer-file__icon', 'aria-hidden': 'true' });
  icon.appendChild(renderIcon(file.mimeType.startsWith('image/') ? FileImage : FileText, 16));
  card.appendChild(icon);
  const copy = el('span', { class: 'sp-answer-file__copy' });
  copy.appendChild(el('span', { class: 'sp-answer-file__name', title: file.name }, file.name));
  copy.appendChild(el('span', { class: 'sp-answer-file__meta' }, fileMetaLabel(file)));
  const status = el('span', { class: 'sp-answer-file__status', role: 'status' });
  copy.appendChild(status);
  card.appendChild(copy);
  const url = access.resolveUrl(file.uri);
  if (url) {
    card.appendChild(buildFileActions(file, url, access, status));
  } else {
    status.textContent = t('spAnswerFileUnavailable');
  }
  return card;
}

function buildVideoResult(file: AnswerFile, url: string, access: AnswerFileAccess): HTMLElement {
  const figure = el('figure', { class: 'sp-answer-image sp-answer-video', role: 'listitem' });
  const frame = el('div', { class: 'sp-answer-image__frame', 'aria-busy': 'true' });
  const loading = el('span', { class: 'sp-answer-image__status', role: 'status' });
  loading.appendChild(renderIcon(Loader2, 16, 'sp-answer-image__spinner'));
  loading.appendChild(document.createTextNode(t('spAnswerVideoLoading')));
  frame.appendChild(loading);
  figure.appendChild(frame);
  const caption = el('figcaption', { class: 'sp-answer-image__caption' });
  caption.appendChild(el('span', { class: 'sp-answer-file__name', title: file.name }, file.name));
  const status = el('span', { class: 'sp-answer-file__status', role: 'status' });
  caption.appendChild(status);
  caption.appendChild(buildFileActions(file, url, access, status));
  figure.appendChild(caption);
  const epoch = previewEpoch;
  let lease: VideoUrlLease | null = null;
  videoViews.set(figure, {
    mount() {
      if (lease || !figure.isConnected || epoch !== previewEpoch) return;
      const owned = acquireVideoObjectUrl(url, access);
      lease = owned;
      const current = (): boolean => lease === owned && figure.isConnected && owned.current();
      frame.setAttribute('aria-busy', 'true');
      loading.replaceChildren(
        renderIcon(Loader2, 16, 'sp-answer-image__spinner'),
        document.createTextNode(t('spAnswerVideoLoading')),
      );
      frame.replaceChildren(loading);
      owned.url
        .then((objectUrl) => {
          if (!current()) return;
          frame.replaceChildren(
            el('video', {
              class: 'sp-answer-video__player',
              src: objectUrl,
              controls: '',
              preload: 'metadata',
              playsinline: '',
              'aria-label': file.name,
            }),
          );
        })
        .catch(() => {
          if (current())
            loading.replaceChildren(document.createTextNode(t('spAnswerVideoFailed', [file.name])));
        })
        .finally(() => {
          if (current()) frame.removeAttribute('aria-busy');
        });
    },
    unmount() {
      const owned = lease;
      lease = null;
      if (!owned) return;
      const video = frame.querySelector('video');
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      owned.release();
    },
  });
  observeVideoViews();
  return figure;
}

function buildImageResult(file: AnswerFile, url: string, access: AnswerFileAccess): HTMLElement {
  const figure = el('figure', { class: 'sp-answer-image', role: 'listitem' });
  const frame = el('div', { class: 'sp-answer-image__frame', 'aria-busy': 'true' });
  const loading = el('span', { class: 'sp-answer-image__status', role: 'status' });
  loading.appendChild(renderIcon(Loader2, 16, 'sp-answer-image__spinner'));
  loading.appendChild(document.createTextNode(t('spAnswerImageLoading')));
  frame.appendChild(loading);
  figure.appendChild(frame);
  const caption = el('figcaption', { class: 'sp-answer-image__caption' });
  caption.appendChild(el('span', { class: 'sp-answer-file__name', title: file.name }, file.name));
  const status = el('span', { class: 'sp-answer-file__status', role: 'status' });
  caption.appendChild(status);
  caption.appendChild(buildFileActions(file, url, access, status));
  figure.appendChild(caption);
  loadImageDataUrl(url, access)
    .then((dataUrl) => {
      frame.replaceChildren(
        buildImageViewerButton(
          el('img', { src: dataUrl, alt: file.name }),
          'sp-answer-image__open',
        ),
      );
    })
    .catch(() => {
      loading.replaceChildren(document.createTextNode(t('spAnswerImageFailed', [file.name])));
    })
    .finally(() => frame.removeAttribute('aria-busy'));
  return figure;
}

export function buildAnswerFiles(
  files: readonly AnswerFile[],
  access: AnswerFileAccess | undefined,
): HTMLElement | null {
  if (files.length === 0 || !access) return null;
  const list = el('div', {
    class: 'sp-answer-files',
    role: 'list',
    'aria-label': t('spAnswerFilesLabel'),
  });
  for (const file of files) {
    const url = isInlineImage(file) || isInlineVideo(file) ? access.resolveUrl(file.uri) : null;
    if (!url) list.appendChild(buildFileCard(file, access));
    else if (isInlineVideo(file)) list.appendChild(buildVideoResult(file, url, access));
    else list.appendChild(buildImageResult(file, url, access));
  }
  return list;
}
