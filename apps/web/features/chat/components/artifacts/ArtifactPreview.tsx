import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  ScrollArea,
  Alert,
  AlertDescription,
  Spinner,
  translateUiPlural,
} from '@agiworkforce/ui';
import {
  Code,
  Eye,
  Download,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Maximize2,
  ExternalLink,
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileDiff,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  Library,
  List,
  Pencil,
  GitFork,
  History,
  MousePointerClick,
  LayoutTemplate,
  ListChecks,
  MessageSquare,
  Palette,
  PenTool,
  Redo2,
  Sparkles,
  TextCursorInput,
  Undo2,
} from 'lucide-react';
import type { PublishResult } from '@agiworkforce/artifacts';
import {
  GOOGLE_DOCS_EXPORT_PATH,
  GOOGLE_DOCS_EXPORT_REFUSALS,
  isGoogleDocsExportRefusalCode,
  isSupportedChatAttachment,
  type GoogleDocsExportRequest,
  type GoogleDocsExportResponse,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { exportDocument } from '@features/chat/services/document-export-service';
import { extractMarkdownHeadings } from '@features/chat/components/research/ResearchReportView';
import {
  summarizeGeneratedFileBundle,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
  type SharedArtifact,
} from '@agiworkforce/types';
import {
  ChartArtifact,
  GeneratedFileCard,
  HighlightedCode,
  MarkdownContent,
  toggleMarkdownTask,
  MermaidDiagram,
  SpreadsheetArtifact,
  PresentationArtifact,
  EmailArtifact,
  spreadsheetSafeExport,
} from '@agiworkforce/unified-chat';
import { TypeIcon } from './artifact-labels';
import { ArtifactMoreMenu, type ArtifactMenuItem } from './ArtifactMoreMenu';
import { ArtifactEditRequestLayer } from './ArtifactEditRequestLayer';
import { ArtifactTitleField, RENAME_ARTIFACT_LABEL } from './ArtifactTitleField';
import { PresentationWorkspace } from './presentation/PresentationWorkspace';
import { StudyDocument } from './study/StudyDocument';
import { replaceImageInHtml } from './design/design-edits';
import { ArtifactChangesReview } from './review/ArtifactChangesReview';
import { BrandKitDialog, SaveTemplateDialog } from './library/LibraryDialogs';
import { useStudioLibrary, type BrandPayload } from './library/studio-library-client';
import { buildApplyBrandRequest } from './library/brand-request';
import { brandThemeMeta } from './presentation/deck-themes';
import { DesignBriefDialog } from './design/DesignBriefDialog';
import { buildBriefRevisionRequest, readDesignBrief } from './design/design-brief';
import {
  IMAGE_EMBED_FAILURE_COPY,
  ImageEmbedError,
  embedImageFile,
} from './presentation/image-embed';
import { hasStudyBlocks } from './study/study-set';
import { ArtifactCommentsPanel, COMMENTS_LABEL } from './comments/ArtifactCommentsPanel';
import {
  canCommentOn,
  useArtifactComments,
  type ArtifactCommentAnchor,
} from './comments/artifact-comments-client';
import { scrollToAnchor, useCommentHighlights } from './comments/use-comment-highlights';
import commentStyles from './comments/Comments.module.css';
import { buildArtifactEditRequest } from './artifact-edit-request';
import { ArtifactSelectionToolbar } from './ArtifactSelectionToolbar';
import {
  buildArtifactSelectionRequest,
  captureSelectionContext,
} from './artifact-selection-request';
import { artifactLineage, buildVersionTimeline, type LineageCandidate } from './artifact-lineage';
import { ArtifactVersionHistory } from './ArtifactVersionHistory';
import { ArtifactChangesView } from './ArtifactChangesView';
import { classifyArtifactDocument } from './artifact-document-classification';
import { cn } from '@shared/lib/utils';
import { useMounted } from '@shared/hooks/useMounted';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useConfirmAction,
} from '@agiworkforce/ui';
import { sanitizeArtifact, hasXSSRisk } from '@shared/utils/html-sanitizer';
import { SandboxedIframe } from '../SandboxedIframe';
import {
  getSandboxOrigin,
  type ArtifactPickerSelection,
  type ArtifactRenderPayload,
} from '@/lib/artifact-sandbox';
import { buildArtifactPreviewDocument, buildArtifactRenderPayload } from './artifact-render';
import { downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { toast } from 'sonner';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { WORK_ENTRY_POINT_LABELS, startWork } from '@/features/work';
import { toUserMessage } from '@/lib/user-error-message';
import { formatRelativeTime } from '@shared/utils/format';
import { SiteViewersEditor } from '@features/sites/components/SiteViewersEditor';
import { readPublishedTokenFromUrl, type PublishedArtifactAudience } from './publishArtifactClient';
import { useLiveArtifactRuntime } from '@/app/chat/live-artifacts/useLiveArtifactRuntime';
import { LiveArtifactControls } from '@/app/chat/live-artifacts/LiveArtifactControls';

/**
 * `navigator.clipboard` does not exist in an insecure context and `writeText`
 * rejects on denied permission or an unfocused document, so this reports
 * whether the copy happened rather than showing a tick for one that did not.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const SECURITY_NOTICE_TEXT =
  'This artifact contained potentially unsafe patterns. They were removed before rendering.';

export interface ArtifactData {
  id: string;
  type:
    | 'html'
    | 'react'
    | 'svg'
    | 'mermaid'
    | 'code'
    | 'document'
    | 'spreadsheet'
    | 'table'
    | 'csv'
    | 'presentation'
    | 'email'
    | 'chart'
    | 'image';
  language?: string;
  title?: string;
  content: string;
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
  /**
   * The stream producing this artifact stopped before its fence closed, so the
   * content is everything that arrived and not the finished document. Set by
   * the streaming sync hook when it persists the partial.
   */
  interrupted?: boolean;
}

const MARKDOWN_SOURCE_LANGUAGE = 'markdown';
const SOURCE_LANGUAGE_FOR_TYPE: Partial<Record<ArtifactData['type'], string>> = {
  react: 'tsx',
};

const INTERRUPTED_ARTIFACT_NOTICE =
  'This artifact stopped before it finished. What arrived is kept below; regenerate for the whole document.';

export interface ArtifactPublishSelection {
  content: string;
  versionIndex: number;
}

/**
 * Who may open the published page. `memberCount` is null when the publisher
 * belongs to no workspace, so the workspace choice, which would answer 403, is
 * not offered.
 */
export interface ArtifactAudienceControl {
  current: PublishedArtifactAudience;
  memberCount: number | null;
  onChange: (next: PublishedArtifactAudience) => Promise<void>;
}

/** The project this artifact's conversation belongs to. */
export interface ArtifactProjectLink {
  id: string;
  name: string;
}

/**
 * Saving the artifact into a project as one of its sources (§23). Distinct from
 * `projectLink`, which only reports where the artifact's conversation lives: a
 * reader can keep a document in a project without moving the chat that made it.
 */
export interface ArtifactProjectSave {
  projects: readonly ArtifactProjectLink[];
  onSave: (projectId: string, file: File) => Promise<void>;
}
interface ArtifactPreviewProps {
  artifact: ArtifactData;
  onShare?: () => void;
  className?: string;
  /** 'card' (default) = inline card with fixed heights + TabsList row.
   *  'panel' = split-view panel: full-height flex-fill + single reference toolbar. */
  variant?: 'card' | 'panel';
  /** Called when user clicks the Close button in panel variant toolbar. */
  onClose?: () => void;
  versionHistory?: SharedArtifact[];
  publishArtifact?: (selection: ArtifactPublishSelection) => Promise<PublishResult>;
  artifactAudience?: ArtifactAudienceControl;
  publishedLink?: string;
  projectLink?: ArtifactProjectLink;
  projectSave?: ArtifactProjectSave;
  onRequestEdits?: (prompt: string) => boolean;
  /** The artifact came from a managed-cloud chat, so it may use AI and the owner's connected apps. */
  liveRuntime?: boolean;
}

const OUTLINE_MIN_HEADINGS = 3;

function MarkdownDocumentPreview({
  content,
  className,
  onTaskToggle,
  pendingChecklistSave,
}: {
  content: string;
  className: string;
  onTaskToggle?: (index: number) => void;
  pendingChecklistSave?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);

  useEffect(() => {
    const rendered = bodyRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4');
    if (!rendered) return;
    headings.forEach((heading, index) => {
      const element = rendered[index];
      if (element) element.id = `artifact-${heading.id}`;
    });
  }, [headings]);

  return (
    <div
      className={cn('overflow-auto bg-background px-5 py-6 sm:px-8', className)}
      data-testid="artifact-markdown-preview"
    >
      <div className="mx-auto max-w-3xl">
        <p
          role="status"
          className={pendingChecklistSave ? 'mb-2 text-xs text-muted-foreground' : 'sr-only'}
        >
          {pendingChecklistSave ? 'Checklist changes save as a new version when you pause.' : ''}
        </p>
        {headings.length >= OUTLINE_MIN_HEADINGS && (
          <details className="group mb-5 rounded-lg border border-border/40 bg-muted/20">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Outline
              <span className="tabular-nums">{headings.length}</span>
              <ChevronRight
                className="ms-auto h-3.5 w-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <nav className="px-3 pb-3" aria-label="Document outline">
              <ol className="space-y-0.5" data-testid="artifact-document-outline">
                {headings.map((heading) => (
                  <li
                    key={heading.id}
                    style={{
                      paddingLeft: `${(heading.level - (headings[0]?.level ?? 1)) * 12}px`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        bodyRef.current?.ownerDocument
                          .getElementById(`artifact-${heading.id}`)
                          ?.scrollIntoView?.({ block: 'start' })
                      }
                      className="block w-full truncate py-0.5 text-start text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        )}
        <div ref={bodyRef}>
          <MarkdownContent content={content} {...(onTaskToggle ? { onTaskToggle } : {})} />
        </div>
      </div>
    </div>
  );
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Spinner size="sm" aria-label="Opening the editor" />
    </div>
  );
}

function PreviewFrameLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
      <Spinner size="sm" aria-label="Loading the preview" />
    </div>
  );
}

const ArtifactCodeEditor = dynamic(
  () => import('./ArtifactCodeEditor').then((module) => module.ArtifactCodeEditor),
  { ssr: false, loading: EditorLoading },
);

const ArtifactDocumentEditor = dynamic(
  () => import('./ArtifactDocumentEditor').then((module) => module.ArtifactDocumentEditor),
  { ssr: false, loading: EditorLoading },
);

const MARKDOWN_SHORTCUTS: Readonly<
  Record<string, { before: string; after: string; placeholder: string }>
> = {
  b: { before: '**', after: '**', placeholder: 'bold text' },
  i: { before: '_', after: '_', placeholder: 'italic text' },
  k: { before: '[', after: '](https://)', placeholder: 'link text' },
};

const ARTIFACT_DRAFT_STORAGE_PREFIX = 'agi.artifact-draft:';
const ARTIFACT_DRAFT_AUTOSAVE_MS = 800;
const CHECKLIST_COMMIT_IDLE_MS = 4_000;

function readStoredDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredDraft(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStoredDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sandboxedPreviewPage(title: string, html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtmlAttribute(title)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts allow-modals" referrerpolicy="no-referrer" srcdoc="${escapeHtmlAttribute(html)}"></iframe></body></html>`;
}

/**
 * Images render through an inert `<img>`, never an iframe. Accept the sources
 * that the product's persisted media pipeline can legitimately produce and
 * reject executable/unknown schemes before they reach the DOM.
 */
function resolveArtifactImageSource(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);/i.test(value)) return value;
  if (value.startsWith('blob:')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;

  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
    if (
      url.protocol === 'http:' &&
      typeof window !== 'undefined' &&
      url.origin === window.location.origin
    ) {
      return url.href;
    }
  } catch {
    // Opaque or malformed values are not renderable image sources.
  }
  return null;
}

/**
 * Stepping forward from one artifact into the next in its lineage has to land
 * on that artifact's first version, but the step changes the selected
 * artifact, which resets this component's view state. The step leaves the
 * index here for the next artifact's reset to pick up.
 */
const pendingVersionIndexByArtifactId = new Map<string, number>();

const REQUEST_EDITS_LABEL = 'Request edits';
const NARROW_ONLY_ITEM_CLASS = '@[26rem]:hidden';
const EDIT_STEP_NARROW_ONLY_ITEM_CLASS = '@[24rem]:hidden';
const UNDO_EDIT_LABEL = 'Undo last change';
const REDO_EDIT_LABEL = 'Redo change';

export function ArtifactPreview({
  artifact,
  onShare,
  className,
  variant = 'card',
  onClose,
  versionHistory,
  publishArtifact,
  artifactAudience,
  publishedLink,
  projectLink,
  projectSave,
  onRequestEdits,
  liveRuntime = false,
}: ArtifactPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const live = useLiveArtifactRuntime(
    liveRuntime && variant === 'panel' && (artifact.type === 'html' || artifact.type === 'react')
      ? artifact.id
      : null,
  );
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const shownPublishedUrl = publishedUrl ?? publishedLink ?? null;
  const publishedToken = shownPublishedUrl ? readPublishedTokenFromUrl(shownPublishedUrl) : null;
  const [isChangingAudience, setIsChangingAudience] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);

  const versionCount = versionHistory?.length ?? 0;
  const restoreArtifactVersion = useArtifactsStore((s) => s.restoreArtifactVersion);
  const forkArtifact = useArtifactsStore((s) => s.forkArtifact);
  const renameArtifact = useArtifactsStore((s) => s.renameArtifact);
  const [renaming, setRenaming] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [brandApply, setBrandApply] = useState<((meta: Record<string, string>) => void) | null>(
    null,
  );
  const studioLibrary = useStudioLibrary();
  const savedBrands = useMemo(
    () =>
      studioLibrary.items.flatMap((item) =>
        item.kind === 'brand' ? [{ id: item.id, name: item.name, brand: item.payload }] : [],
      ),
    [studioLibrary.items],
  );
  const brandThemes = useMemo(
    () =>
      savedBrands.map(({ id, name, brand }) => ({
        id,
        name,
        meta: brandThemeMeta({ name, ...brand }),
      })),
    [savedBrands],
  );
  const loadStudioLibrary = studioLibrary.load;
  const wantsLibrary =
    variant === 'panel' && (artifact.type === 'presentation' || artifact.type === 'document');
  useEffect(() => {
    if (wantsLibrary) void loadStudioLibrary();
  }, [wantsLibrary, loadStudioLibrary]);
  const [commentDraft, setCommentDraft] = useState<ArtifactCommentAnchor | null>(null);
  const { comments: artifactComments } = useArtifactComments(artifact.id);
  const upsertArtifact = useArtifactsStore((s) => s.upsertArtifact);
  const isStoredArtifact = useArtifactsStore((s) => s.artifacts.some((a) => a.id === artifact.id));
  const editRequested = useArtifactsStore((s) => s.editRequestedArtifactId === artifact.id);
  const clearEditRequest = useArtifactsStore((s) => s.clearEditRequest);
  const [viewedVersionIndex, setViewedVersionIndex] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changesShownFor, setChangesShownFor] = useState<string | null>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [editRequestMode, setEditRequestMode] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<ArtifactPickerSelection | null>(null);
  const selectArtifact = useArtifactsStore((s) => s.selectArtifact);
  const lineageCandidates = useArtifactsStore((s) => {
    const conversationId = s.artifacts.find((stored) => stored.id === artifact.id)?.conversationId;
    return conversationId ? s.getConversationArtifacts(conversationId) : [];
  });
  const lineage = useMemo(
    () =>
      artifactLineage<LineageCandidate>(
        lineageCandidates.map((candidate) => ({
          id: candidate.id,
          type: candidate.type,
          title: candidate.title,
          createdAt: candidate.createdAt,
        })),
        { id: artifact.id, type: artifact.type, title: artifact.title, createdAt: null },
      ),
    [lineageCandidates, artifact.id, artifact.type, artifact.title],
  );
  const lineageVersionCounts = useArtifactsStore((s) =>
    lineage.map((member) => s.getArtifactVersions(member.id).length).join(','),
  );
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmAction();

  const { isPdf, isDocx, isMarkdownDoc } = classifyArtifactDocument(artifact);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);
  const isImage = artifact.type === 'image';
  const [imageError, setImageError] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    setDocxHtml(null);
    setDocxError(null);
    if (!isDocx || !artifact.content) return;
    let cancelled = false;

    async function convertDocx() {
      try {
        const mammoth = (await import('mammoth')).default;
        let arrayBuffer: ArrayBuffer;
        if (artifact.content.startsWith('/api/files/')) {
          const response = await fetch(artifact.content, { credentials: 'same-origin' });
          if (!response.ok) throw new Error('The document could not be loaded for preview.');
          arrayBuffer = await response.arrayBuffer();
        } else if (artifact.content.startsWith('data:')) {
          const base64 = artifact.content.split(',')[1] ?? '';
          const binary = atob(base64);
          arrayBuffer = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i)).buffer;
        } else {
          const binary = artifact.content;
          arrayBuffer = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i)).buffer;
        }
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setDocxHtml(result.value);
      } catch (err) {
        if (!cancelled) setDocxError(toUserMessage(err, 'DOCX conversion failed'));
      }
    }

    void convertDocx();
    return () => {
      cancelled = true;
    };
  }, [isDocx, artifact.id, artifact.content]);
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useMounted();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const imageReplaceInputRef = useRef<HTMLInputElement>(null);
  const [imageReplaceTarget, setImageReplaceTarget] = useState<string | null>(null);

  // Leaving native fullscreen through Escape or browser UI fires
  // fullscreenchange without going through the button.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setIsFullscreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);
  const generatedFileSummary = useMemo(
    () =>
      summarizeGeneratedFileBundle({
        computeSession: artifact.computeSession,
        generatedFile: artifact.generatedFile,
        artifactManifest: artifact.artifactManifest,
        fallbackFileName: artifact.title,
        fallbackKind: artifact.generatedFile?.kind ?? artifact.language ?? artifact.type,
        fallbackMimeType: artifact.generatedFile?.mimeType,
        fallbackUri: artifact.generatedFile?.uri,
        fallbackStatus: artifact.computeSession?.status,
      }),
    [artifact],
  );
  const hasGeneratedFileManifest = Boolean(
    artifact.computeSession || artifact.generatedFile || artifact.artifactManifest,
  );

  const pdfSrc = useMemo<string | null>(() => {
    if (!isPdf) return null;
    const mime = (generatedFileSummary.mimeType ?? '').toLowerCase();
    const candidates = [artifact.content, generatedFileSummary.primaryUri];
    for (const raw of candidates) {
      if (!raw) continue;
      const value = raw.trim();
      if (value.toLowerCase().startsWith('data:application/pdf')) return value;
      if (value.startsWith('blob:')) return value;
      // Same-origin http(s) URL pointing at a PDF (never an arbitrary origin).
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(value)) {
        try {
          const url = new URL(value);
          if (
            url.origin === window.location.origin &&
            (url.pathname.toLowerCase().endsWith('.pdf') || mime.includes('pdf'))
          ) {
            if (url.pathname.startsWith('/api/files/')) url.searchParams.set('preview', 'pdf');
            return url.href;
          }
        } catch {
          // noop
        }
      }
      // Relative same-origin path.
      if (value.startsWith('/') && (value.toLowerCase().endsWith('.pdf') || mime.includes('pdf'))) {
        if (value.startsWith('/api/files/')) {
          const url = new URL(value, window.location.origin);
          url.searchParams.set('preview', 'pdf');
          return `${url.pathname}${url.search}${url.hash}`;
        }
        return value;
      }
    }
    return null;
  }, [isPdf, artifact.content, generatedFileSummary.primaryUri, generatedFileSummary.mimeType]);

  const isBlobPdf = Boolean(pdfSrc?.startsWith('blob:'));
  const [pdfBlobOk, setPdfBlobOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pdfSrc || !pdfSrc.startsWith('blob:')) {
      setPdfBlobOk(null);
      return;
    }
    let cancelled = false;
    setPdfBlobOk(null);
    fetch(pdfSrc)
      .then((r) => r.blob())
      .then((b) => {
        if (!cancelled) setPdfBlobOk(b.type === 'application/pdf');
      })
      .catch(() => {
        if (!cancelled) setPdfBlobOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfSrc]);

  const docxPreviewHtml = useMemo(() => {
    if (!docxHtml) return null;
    const sanitizedDocxHtml = sanitizeArtifact(docxHtml, 'html');

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';">
    <style>
      body {
        margin: 0;
        padding: 24px;
        color: rgb(17 24 39);
        background: white;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.6;
      }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; max-width: 100%; }
      td, th { border: 1px solid rgb(209 213 219); padding: 6px 8px; }
    </style>
  </head>
  <body>${sanitizedDocxHtml}</body>
</html>`;
  }, [docxHtml]);

  // Which version index the viewer is currently showing (defaults to latest).
  const shownVersionIndex = viewedVersionIndex ?? (versionCount > 0 ? versionCount - 1 : 0);

  // The content the viewer renders / copies / downloads. When the user has
  // navigated the version chip, this is the viewed version's content; otherwise
  // it is the artifact's current content (the card variant never passes
  // versionHistory, so it always lands on the latter).
  const activeContent =
    versionHistory && versionHistory[shownVersionIndex]
      ? versionHistory[shownVersionIndex]!.content
      : artifact.content;
  const imageSrc = useMemo(
    () => (isImage ? resolveArtifactImageSource(activeContent) : null),
    [isImage, activeContent],
  );

  useEffect(() => {
    const pendingIndex = pendingVersionIndexByArtifactId.get(artifact.id);
    pendingVersionIndexByArtifactId.delete(artifact.id);
    setViewedVersionIndex(
      pendingIndex !== undefined && pendingIndex < versionCount - 1 ? pendingIndex : null,
    );
    setEditRequestMode(false);
    setPickerSelection(null);
    setRenaming(false);
    setCommentDraft(null);
    setRenderError(null);
    setPdfError(false);
    setImageError(false);
    setCopied(false);
    // An unsaved draft belongs to the revision it was opened from. Carrying it
    // across an artifact swap or a new version would overwrite other content.
    setSourceDraft(null);
    setEditorFocusRequest(0);
    // A published URL belongs to one artifact id; keeping it after a swap
    // would offer the previous artifact's public link under this title.
    setPublishedUrl(null);
    setMermaidSvg(null);
  }, [artifact.id, versionCount]);

  /**
   * Manual source editing (panel variant). A save goes through the same
   * content-keyed store path Restore uses, so the edit becomes a new version
   * rather than an overwrite.
   *
   * Offered only for artifacts whose source IS text and only on the latest
   * version: PDF/DOCX/image content is an opaque data URI, and an older
   * revision has to be restored before it can be edited.
   */
  const isLatestVersion = versionCount === 0 || shownVersionIndex === versionCount - 1;
  const versionTimeline = useMemo(() => {
    const counts = lineageVersionCounts.split(',').map((count) => Number(count) || 0);
    return buildVersionTimeline(
      lineage.map((member, index) => ({
        id: member.id,
        versionCount: member.id === artifact.id ? versionCount : (counts[index] ?? 0),
      })),
      artifact.id,
      shownVersionIndex,
    );
  }, [lineage, lineageVersionCounts, artifact.id, versionCount, shownVersionIndex]);
  const showVersionChip = versionCount > 0 || versionTimeline.total > 1;
  const shownVersion = versionHistory?.[shownVersionIndex];
  const shownVersionModifiedAt = shownVersion
    ? (shownVersion.updatedAt ?? shownVersion.createdAt)
    : null;
  const [, setModifiedClock] = useState(0);
  useEffect(() => {
    if (variant !== 'panel' || !shownVersionModifiedAt) return;
    const timer = setInterval(() => setModifiedClock((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [variant, shownVersionModifiedAt]);
  const modifiedLabel =
    mounted && shownVersionModifiedAt ? formatRelativeTime(shownVersionModifiedAt) : '';

  const stepVersion = useCallback(
    (step: { artifactId: string; versionIndex: number | null } | null) => {
      if (!step) return;
      if (step.artifactId === artifact.id) {
        setViewedVersionIndex(step.versionIndex);
        return;
      }
      if (step.versionIndex !== null) {
        pendingVersionIndexByArtifactId.set(step.artifactId, step.versionIndex);
      }
      selectArtifact(step.artifactId);
    },
    [artifact.id, selectArtifact],
  );
  const changesKey = `${artifact.id}:${shownVersionIndex}:${versionCount}`;
  const previousVersionContent =
    shownVersionIndex > 0 ? versionHistory?.[shownVersionIndex - 1]?.content : undefined;
  const canShowChanges =
    variant === 'panel' &&
    previousVersionContent !== undefined &&
    !isPdf &&
    !isDocx &&
    !isImage &&
    sourceDraft === null;
  if (changesShownFor !== null && (changesShownFor !== changesKey || !canShowChanges)) {
    setChangesShownFor(null);
  }
  const showChanges = canShowChanges && changesShownFor === changesKey;

  useEffect(() => {
    setHistoryOpen(false);
  }, [artifact.id]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    historyToggleRef.current?.focus();
  }, []);

  const requestRestore = useCallback(
    (index: number) => {
      const draftIsUnsaved =
        sourceDraft !== null && sourceDraft !== versionHistory?.[index]?.content;
      const summary = `This replaces what you are looking at with version ${
        index + 1
      }, added as the new latest so the versions in between survive.`;
      confirmAction({
        title: `Restore version ${index + 1}?`,
        description: draftIsUnsaved ? `${summary} Your unsaved edits are discarded.` : summary,
        confirmLabel: 'Restore',
        destructive: draftIsUnsaved,
        onConfirm: () => {
          if (restoreArtifactVersion(artifact.id, index)) {
            removeStoredDraft(`${ARTIFACT_DRAFT_STORAGE_PREFIX}${artifact.id}`);
            setSourceDraft(null);
            setViewedVersionIndex(null);
          }
        },
      });
    },
    [artifact.id, confirmAction, restoreArtifactVersion, sourceDraft, versionHistory],
  );
  const canEditSource =
    variant === 'panel' && isStoredArtifact && isLatestVersion && !isPdf && !isDocx && !isImage;

  const [editTrail, setEditTrail] = useState<{
    artifactId: string;
    versionCount: number;
    at: number;
    redo: readonly number[];
  } | null>(null);
  const activeEditTrail =
    editTrail && editTrail.artifactId === artifact.id && editTrail.versionCount === versionCount
      ? editTrail
      : null;
  const editBaseIndex = activeEditTrail ? activeEditTrail.at : versionCount - 1;
  const canStepEdits = variant === 'panel' && isStoredArtifact && sourceDraft === null;
  const showEditSteps = canStepEdits && (versionCount > 1 || activeEditTrail !== null);
  const canUndoEdit = showEditSteps && editBaseIndex > 0;
  const canRedoEdit = showEditSteps && (activeEditTrail?.redo.length ?? 0) > 0;

  const stepEdit = useCallback(
    (target: number, redo: readonly number[]) => {
      const appended = restoreArtifactVersion(artifact.id, target);
      setEditTrail({
        artifactId: artifact.id,
        versionCount: appended ? versionCount + 1 : versionCount,
        at: target,
        redo,
      });
      setViewedVersionIndex(null);
    },
    [artifact.id, restoreArtifactVersion, versionCount],
  );
  const undoEdit = useCallback(() => {
    if (!canUndoEdit) return;
    stepEdit(editBaseIndex - 1, [...(activeEditTrail?.redo ?? []), editBaseIndex]);
  }, [activeEditTrail, canUndoEdit, editBaseIndex, stepEdit]);
  const redoEdit = useCallback(() => {
    const redo = activeEditTrail?.redo ?? [];
    const target = redo[redo.length - 1];
    if (!canRedoEdit || target === undefined) return;
    stepEdit(target, redo.slice(0, -1));
  }, [activeEditTrail, canRedoEdit, stepEdit]);

  const draftStorageKey = `${ARTIFACT_DRAFT_STORAGE_PREFIX}${artifact.id}`;
  const [draftStatus, setDraftStatus] = useState<'saved' | 'unsaved' | null>(null);
  const [draftOrigin, setDraftOrigin] = useState<'editor' | 'checklist' | null>(null);

  useEffect(() => {
    if (!canEditSource) return;
    const kept = readStoredDraft(draftStorageKey);
    if (kept === null || kept === activeContent) return;
    setSourceDraft(kept);
    setDraftOrigin('editor');
    setActiveTab('code');
    setDraftStatus('saved');
    toast.message('Restored your unsaved edits to this artifact');
  }, [activeContent, canEditSource, draftStorageKey]);

  useEffect(() => {
    if (!editRequested || variant !== 'panel') return;
    setViewedVersionIndex(null);
    if (!canEditSource) return;
    setSourceDraft((current) => current ?? activeContent);
    setDraftOrigin('editor');
    setActiveTab('code');
    setChangesShownFor(null);
    setEditorFocusRequest((count) => count + 1);
    clearEditRequest();
  }, [activeContent, canEditSource, clearEditRequest, editRequested, variant]);

  useEffect(() => {
    if (sourceDraft === null) return;
    const timer = setTimeout(() => {
      setDraftStatus(writeStoredDraft(draftStorageKey, sourceDraft) ? 'saved' : 'unsaved');
    }, ARTIFACT_DRAFT_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draftStorageKey, sourceDraft]);

  const endSourceEdit = useCallback(() => {
    removeStoredDraft(draftStorageKey);
    setDraftStatus(null);
    setDraftOrigin(null);
    setSourceDraft(null);
    setEditorFocusRequest(0);
  }, [draftStorageKey]);

  const saveSourceEdit = useCallback(() => {
    if (sourceDraft === null) return;
    const stored = useArtifactsStore.getState().artifacts.find((a) => a.id === artifact.id);
    if (!stored) return;
    if (sourceDraft !== stored.content) {
      upsertArtifact({ ...stored, content: sourceDraft, createdAt: new Date() });
    }
    endSourceEdit();
  }, [artifact.id, endSourceEdit, sourceDraft, upsertArtifact]);

  const saveArtifactContent = useCallback(
    (next: string) => {
      const stored = useArtifactsStore.getState().artifacts.find((a) => a.id === artifact.id);
      if (!stored || next === stored.content) return;
      upsertArtifact({ ...stored, content: next, createdAt: new Date() });
    },
    [artifact.id, upsertArtifact],
  );

  const handleTaskToggle = useCallback(
    (index: number) => {
      setSourceDraft((current) => toggleMarkdownTask(current ?? activeContent, index));
      setDraftOrigin((origin) => origin ?? 'checklist');
    },
    [activeContent],
  );

  useEffect(() => {
    if (draftOrigin !== 'checklist' || sourceDraft === null) return;
    const timer = setTimeout(saveSourceEdit, CHECKLIST_COMMIT_IDLE_MS);
    return () => clearTimeout(timer);
  }, [draftOrigin, saveSourceEdit, sourceDraft]);

  // Only SVG and Mermaid markup is stripped before it reaches the DOM. HTML and
  // React run their scripts on purpose inside the null-origin sandbox, and code
  // and documents render as text, so neither has a mitigation to report.
  const securityNotice = useMemo(
    () => (artifact.type === 'svg' || artifact.type === 'mermaid') && hasXSSRisk(activeContent),
    [artifact.type, activeContent],
  );

  const getPreviewHTML = useCallback(
    (): string => buildArtifactPreviewDocument(artifact.type, activeContent),
    [activeContent, artifact.type],
  );

  // SandboxedIframe posts this payload to the cross-origin sandbox when one is
  // configured, or falls back to the null-origin srcDoc above.
  //
  // DOMPurify has no sanitize() without a DOM, so the payload and its srcDoc
  // fallback are built only after mount. The server and the first client
  // render both show the loading state, which keeps hydration identical and
  // never hands the frame markup the sanitiser has not seen.
  const sandboxPayload = useMemo<ArtifactRenderPayload | null>(
    () => (mounted ? buildArtifactRenderPayload(artifact.type, activeContent) : null),
    [mounted, activeContent, artifact.type],
  );

  const handleCopy = async () => {
    if (!(await writeToClipboard(activeContent))) {
      toast.error('Could not copy to clipboard');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = useCallback(async () => {
    if (!publishArtifact || isPublishing) return;
    setIsPublishing(true);
    try {
      const result = await publishArtifact({
        content: activeContent,
        versionIndex: shownVersionIndex,
      });
      if (result.kind === 'cloud') {
        setPublishedUrl(result.shareUrl);
        if (await writeToClipboard(result.shareUrl)) {
          toast.success('Published · link copied to clipboard');
        } else {
          toast.success('Published. Copy the link from the bar below.');
        }
        return;
      }
      if (result.kind === 'local') {
        setPublishedUrl(result.shareUrl);
        toast.success('Exported to a local file');
        return;
      }
      setPublishedUrl(null);
      if (await writeToClipboard(activeContent)) {
        toast.message(result.reason, { description: 'Artifact source copied to the clipboard.' });
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      setPublishedUrl(null);
      toast.error(toUserMessage(error, 'Failed to publish artifact'));
    } finally {
      setIsPublishing(false);
    }
  }, [publishArtifact, isPublishing, activeContent, shownVersionIndex]);

  const handleChangeAudience = useCallback(
    (next: PublishedArtifactAudience) => {
      if (!artifactAudience || isChangingAudience || next === artifactAudience.current) return;
      const members = artifactAudience.memberCount ?? 0;
      const memberLabel = translateUiPlural('settings', 'counts.members', members, {
        one: '{{count}} member',
        other: '{{count}} members',
      });
      const apply = async () => {
        setIsChangingAudience(true);
        try {
          await artifactAudience.onChange(next);
          toast.success(
            next === 'organization'
              ? 'Only your workspace can open this now'
              : next === 'invited'
                ? 'Only the people you invite can open this now'
                : 'Anyone with the link can open this now',
          );
        } catch (error) {
          toast.error(toUserMessage(error, 'Could not change who can open this'));
        } finally {
          setIsChangingAudience(false);
        }
      };
      if (next === 'invited') {
        confirmAction({
          title: 'Limit this to people you invite?',
          description: `${
            artifactAudience.current === 'organization'
              ? `Your ${memberLabel} lose access unless you add them.`
              : 'Anyone who already has the link loses access unless you add them.'
          } Only the people you add by email can open it after signing in. You can switch back, and the link stays the same.`,
          confirmLabel: 'Limit to invited people',
          onConfirm: apply,
        });
        return;
      }
      confirmAction(
        next === 'organization'
          ? {
              title: 'Limit this to your workspace?',
              description: `${
                artifactAudience.current === 'invited'
                  ? 'The people you invited from outside your workspace lose access.'
                  : 'The public link stops opening, so anyone outside your workspace who already has it loses access.'
              } Your ${memberLabel} can open it instead. You can switch back, and the link stays the same.`,
              confirmLabel: 'Share with workspace',
              onConfirm: apply,
            }
          : {
              title: 'Make this public again?',
              description:
                artifactAudience.memberCount === null
                  ? 'Anyone holding the link can open it without signing in, including anyone they forward it to. Publishing cannot un-share a copy somebody has already taken.'
                  : 'Anyone holding the link can open it, including people outside your workspace and anyone they forward it to. Publishing cannot un-share a copy somebody has already taken.',
              confirmLabel: 'Make public',
              onConfirm: apply,
            },
      );
    },
    [artifactAudience, isChangingAudience, confirmAction],
  );

  const handleDownload = (format: 'html' | 'txt' | 'md') => {
    const content = activeContent;

    let blob: Blob;
    let filename: string;

    switch (format) {
      case 'html':
        blob = new Blob([getPreviewHTML()], { type: 'application/octet-stream' });
        filename = `${artifact.title || 'artifact'}.html`;
        break;
      case 'md': {
        const markdown = isMarkdownDoc
          ? content
          : `# ${artifact.title || 'Artifact'}\n\n\`\`\`${artifact.language || artifact.type}\n${content}\n\`\`\``;
        blob = new Blob([markdown], { type: 'text/markdown' });
        filename = `${artifact.title || 'artifact'}.md`;
        break;
      }
      default: {
        // "Download source (.<language>)" writes the raw body, so a model-chosen
        // language of csv/tsv lands a formula in a spreadsheet file just as the CSV item would
        const extension = artifact.language || 'txt';
        const source = spreadsheetSafeExport(content, extension);
        blob = new Blob([source.body], { type: source.mimeType });
        filename = `${artifact.title || 'artifact'}.${extension}`;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * The file a project source should receive. An artifact's language is
   * whatever the model called it, and the source allowlist does not accept
   * every such name, so anything it would reject is saved as Markdown with the
   * body fenced, which is readable and always accepted rather than a save that
   * fails after the reader picks a project.
   */
  const artifactSourceFile = useCallback((): File => {
    const title = artifact.title || 'artifact';
    const language = (artifact.language || artifact.type || 'txt').toLowerCase();
    if (isMarkdownDoc) {
      return new File([activeContent], `${title}.md`, { type: 'text/markdown' });
    }
    const sourceName = `${title}.${language}`;
    if (isSupportedChatAttachment(sourceName, '')) {
      return new File([activeContent], sourceName, { type: 'text/plain' });
    }
    const markdown = `# ${title}\n\n\`\`\`${language}\n${activeContent}\n\`\`\``;
    return new File([markdown], `${title}.md`, { type: 'text/markdown' });
  }, [activeContent, artifact.language, artifact.title, artifact.type, isMarkdownDoc]);

  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  const handleSaveToLibrary = useCallback(async () => {
    setSavingToLibrary(true);
    try {
      const file = artifactSourceFile();
      const response = await fetch('/api/library', {
        method: 'POST',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fileName: file.name, content: await file.text() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string } | string;
        } | null;
        const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
        throw new Error(message ?? 'That artifact could not be saved to your Library');
      }
      toast.success('Saved to your Library');
    } catch (error) {
      toast.error(toUserMessage(error, 'That artifact could not be saved to your Library'));
    } finally {
      setSavingToLibrary(false);
    }
  }, [artifactSourceFile]);

  const handleSaveToProject = useCallback(
    async (project: ArtifactProjectLink) => {
      if (!projectSave) return;
      setSavingProjectId(project.id);
      try {
        await projectSave.onSave(project.id, artifactSourceFile());
        toast.success(`Saved to ${project.name}`);
      } catch (error) {
        toast.error(toUserMessage(error, 'That artifact could not be saved to the project'));
      } finally {
        setSavingProjectId(null);
      }
    },
    [artifactSourceFile, projectSave],
  );

  const isTextDocument = artifact.type === 'document' && !isPdf && !isDocx;

  const [savingToGoogleDocs, setSavingToGoogleDocs] = useState(false);
  const handleSaveToGoogleDocs = async () => {
    if (savingToGoogleDocs) return;
    setSavingToGoogleDocs(true);
    try {
      const request: GoogleDocsExportRequest = {
        title: artifact.title || 'Document',
        content: activeContent,
      };
      const response = await fetch(GOOGLE_DOCS_EXPORT_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(request),
      });
      const body = (await response
        .json()
        .catch(() => ({}))) as Partial<GoogleDocsExportResponse> & {
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.url) {
        const code = body.error?.code ?? '';
        const needsConnection = isGoogleDocsExportRefusalCode(code);
        toast.error(
          needsConnection
            ? GOOGLE_DOCS_EXPORT_REFUSALS[code]
            : 'The document was not saved to Google Docs.',
          {
            ...(needsConnection
              ? {
                  action: {
                    label: 'Open connectors',
                    onClick: () => window.open('/connectors', '_self'),
                  },
                }
              : {}),
          },
        );
        return;
      }
      const url = body.url;
      toast.success('Saved to Google Docs', {
        action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') },
      });
    } catch (error) {
      toast.error(toUserMessage(error, 'The document was not saved to Google Docs.'));
    } finally {
      setSavingToGoogleDocs(false);
    }
  };

  const handleExportDeckPdf = async () => {
    const title = artifact.title || 'Presentation';
    const pending = toast.loading('Preparing the PDF…');
    try {
      const { downloadDeckPdf } = await import('./presentation/deck-pdf');
      await downloadDeckPdf(title, activeContent);
      toast.success('PDF downloaded', { id: pending });
    } catch (error) {
      toast.error(toUserMessage(error, 'The PDF could not be made'), { id: pending });
    }
  };

  const handleExportDocument = async (format: 'docx' | 'pdf') => {
    const title = artifact.title || 'Artifact';
    try {
      await exportDocument(activeContent, format, title, { title });
    } catch (error) {
      toast.error(
        toUserMessage(
          error,
          `This document could not be exported as ${format === 'docx' ? 'Word' : 'PDF'}`,
        ),
      );
    }
  };

  const handleDownloadGeneratedFile = async () => {
    if (!generatedFileSummary.primaryUri) return;
    try {
      await downloadGeneratedFile(
        generatedFileSummary.primaryUri,
        generatedFileSummary.fileName,
        generatedFileSummary.mimeType,
      );
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this file'));
    }
  };

  const handleDownloadImage = async () => {
    if (!imageSrc) return;
    const language = (artifact.language || 'png').toLowerCase().replace(/^\.+/, '');
    const extension = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(language)
      ? language
      : 'png';
    const title = artifact.title || 'generated-image';
    const fileName = /\.[a-z0-9]{1,8}$/i.test(title) ? title : `${title}.${extension}`;
    const mimeType =
      artifact.generatedFile?.mimeType ??
      (extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);
    try {
      await downloadGeneratedFile(imageSrc, fileName, mimeType);
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this image'));
    }
  };

  const handleShareGeneratedFile = async () => {
    const shareText = [
      `${generatedFileSummary.kindLabel}: ${generatedFileSummary.fileName}`,
      generatedFileSummary.privacyLabel
        ? `Privacy: ${generatedFileSummary.privacyLabel}`
        : undefined,
      generatedFileSummary.providerLabel
        ? `Provider: ${generatedFileSummary.providerLabel}`
        : undefined,
      generatedFileSummary.sourceSurfaceLabel
        ? `Source: ${generatedFileSummary.sourceSurfaceLabel}`
        : undefined,
      generatedFileSummary.sourceSessionLabel,
      generatedFileSummary.primaryUri,
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator.share && generatedFileSummary.primaryUri?.startsWith('http')) {
      try {
        await navigator.share({
          title: generatedFileSummary.title,
          text: shareText,
          url: generatedFileSummary.primaryUri,
        });
        return;
      } catch (error) {
        // AbortError: the user dismissed the native share sheet - not a
        // failure, nothing to report. Anything else (permission denied, no
        // share target) falls through to the clipboard fallback below instead
        // of leaving an unhandled rejection and a share button that did
        // nothing visible.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    if (!(await writeToClipboard(shareText))) {
      toast.error('Could not copy the share details to the clipboard');
    }
  };

  const handleOpenInNewTab = () => {
    const page = sandboxedPreviewPage(artifact.title || 'Artifact', getPreviewHTML());

    // eslint-disable-next-line no-restricted-syntax -- the page only frames the artifact in a sandbox without allow-same-origin
    const blob = new Blob([page], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleRefresh = () => {
    setRenderError(null);
    setPdfError(false);
    setImageError(false);
    setRefreshKey((k) => k + 1);
  };

  // Download a PDF/DOCX artifact as its real bytes. The content is either a
  // `data:` URI (anchor directly so the browser saves the decoded bytes, not
  // the URI text) or a raw binary string (wrap in a Blob). The generic
  // handleDownload('txt'/'html'/'md') paths would corrupt these by writing the
  // string representation, so binary docs get this dedicated handler instead.
  const handleDownloadBinaryDoc = () => {
    const ext = artifact.language || (isPdf ? 'pdf' : 'docx');
    const title = artifact.title || 'artifact';
    const filename = title.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? title
      : `${title}.${ext}`;
    const a = document.createElement('a');
    let objectUrl: string | null = null;
    if (artifact.content.startsWith('data:')) {
      a.href = artifact.content;
    } else {
      const blob = new Blob([artifact.content], { type: 'application/octet-stream' });
      objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
  };

  const handleFullscreen = () => {
    const enter = !isFullscreen;
    // The in-page expanded layout (isFullscreen) is the real fullscreen experience and
    // the source of truth. The native Fullscreen API is a best-effort ENHANCEMENT: it
    // can reject (permissions policy, no user activation, unsupported context), so its
    // promise is always caught. An uncaught rejection would otherwise surface as a dev
    // error overlay ("not granted") and, in production, an unhandled promise rejection.
    setIsFullscreen(enter);
    try {
      if (enter && !document.fullscreenElement && containerRef.current?.requestFullscreen) {
        void containerRef.current.requestFullscreen().catch(() => {});
      } else if (!enter && document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    } catch {
      // noop
    }
  };

  const canPreview = ['html', 'react', 'svg'].includes(artifact.type);
  const isMermaid = artifact.type === 'mermaid';

  const isTabular = ['spreadsheet', 'table', 'csv'].includes(artifact.type);
  const isPresentation = artifact.type === 'presentation';
  const isEmail = artifact.type === 'email';
  // A chart artifact carries a JSON spec, not markup: the sandbox iframe only
  // ever printed the escaped JSON.
  const isChart = artifact.type === 'chart';
  const isSharedRendered = isTabular || isPresentation || isEmail || isChart;
  const hasPreviewSurface =
    canPreview || isMermaid || isPdf || isDocx || isSharedRendered || isImage || isMarkdownDoc;
  const sourceLanguage = isMarkdownDoc
    ? MARKDOWN_SOURCE_LANGUAGE
    : (artifact.language ?? SOURCE_LANGUAGE_FOR_TYPE[artifact.type] ?? artifact.type);

  // The unified-chat Artifact view of this artifact (content follows the
  // version navigation, exactly like the sandbox preview does).
  const sharedArtifactView = useMemo(
    () => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      content: activeContent,
      language: artifact.language,
    }),
    [artifact.id, artifact.type, artifact.title, artifact.language, activeContent],
  );

  const handleDownloadCsv = () => {
    const sheet = spreadsheetSafeExport(activeContent, 'csv');
    const blob = new Blob([sheet.body], { type: sheet.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'spreadsheet'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMermaidSvg = () => {
    if (!mermaidSvg) return;
    const blob = new Blob([mermaidSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'diagram'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderMermaidPreview = (containerClassName: string) => (
    <div
      className={cn('overflow-auto bg-background px-6 py-5', containerClassName)}
      data-testid="artifact-mermaid-preview"
    >
      <div className="mx-auto max-w-3xl">
        <MermaidDiagram
          source={activeContent}
          className="mermaid-block"
          onRenderResult={(result) => setMermaidSvg(result && 'svg' in result ? result.svg : null)}
        />
      </div>
    </div>
  );

  const renderMarkdownPreview = (containerClassName: string) =>
    hasStudyBlocks(activeContent) && sourceDraft === null ? (
      <StudyDocument
        content={activeContent}
        className={containerClassName}
        editable={canEditSource}
        onSave={saveArtifactContent}
        {...(onRequestEdits && variant === 'panel' ? { onAsk: onRequestEdits } : {})}
      />
    ) : (
      <MarkdownDocumentPreview
        content={sourceDraft ?? activeContent}
        className={containerClassName}
        {...(canEditSource ? { onTaskToggle: handleTaskToggle } : {})}
        pendingChecklistSave={draftOrigin === 'checklist' && sourceDraft !== null}
      />
    );

  const renderSharedPreview = (containerClassName: string) => (
    <div className={cn('overflow-auto bg-background p-0', containerClassName)}>
      {isTabular ? (
        <SpreadsheetArtifact
          artifact={sharedArtifactView}
          className="h-full rounded-none border-0"
        />
      ) : isPresentation && variant === 'panel' ? (
        <PresentationWorkspace
          title={artifact.title || 'Presentation'}
          content={activeContent}
          editable={canEditSource && sourceDraft === null}
          handEdited={versionCount > 1}
          onSave={saveArtifactContent}
          {...(onRequestEdits && isLatestVersion ? { onRequestEdits } : {})}
          brandThemes={brandThemes}
          {...(canEditSource
            ? {
                onCreateBrand: (apply: (meta: Record<string, string>) => void) =>
                  setBrandApply(() => apply),
              }
            : {})}
          {...(canComment
            ? {
                onCommentSlide: (slide: number) => {
                  setCommentDraft({ kind: 'slide', slide });
                  setCommentsOpen(true);
                },
              }
            : {})}
        />
      ) : isPresentation ? (
        <PresentationArtifact artifact={sharedArtifactView} className="h-full rounded-none" />
      ) : isChart ? (
        <ChartArtifact artifact={sharedArtifactView} className="h-full rounded-none border-0" />
      ) : (
        <EmailArtifact artifact={sharedArtifactView} className="rounded-none border-0" />
      )}
    </div>
  );

  // A download action for the PDF fallback, only when real bytes exist:
  // a generated-file uri (compute output) or an inline data:/blob: content.
  const pdfDownload: (() => void) | null = generatedFileSummary.primaryUri
    ? () => void handleDownloadGeneratedFile()
    : artifact.content.startsWith('data:') || artifact.content.startsWith('blob:')
      ? handleDownloadBinaryDoc
      : null;

  // Shared PDF preview body used by both the panel and card variants. Renders
  // the native browser PDF viewer ONLY when a validated same-origin/blob/data
  // source exists and hasn't failed to load; otherwise an honest fallback with
  // a real Download (never a fake/blank preview). `containerClassName` supplies
  // the height (full-height in the panel, fixed height in the card).
  // A blob source that is still being MIME-verified: show a brief loading state
  // rather than flashing the iframe or the fallback.
  const pdfBlobPending = isBlobPdf && pdfBlobOk === null;
  const canRenderPdf = Boolean(pdfSrc) && !pdfError && (!isBlobPdf || pdfBlobOk === true);

  const renderPdfPreview = (containerClassName: string) => (
    <div className={cn('bg-muted/20', containerClassName)}>
      {pdfBlobPending ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading PDF…
        </div>
      ) : canRenderPdf ? (
        <iframe
          key={`pdf-${refreshKey}`}
          title={artifact.title || 'PDF Preview'}
          src={pdfSrc ?? undefined}
          onError={() => setPdfError(true)}
          className="h-full w-full border-0"
          aria-label={artifact.title || 'PDF document'}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
          data-testid="artifact-pdf-fallback"
        >
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {pdfError ? "This PDF couldn't be displayed." : 'Inline preview unavailable'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {pdfError
                ? 'The document failed to render in the viewer. Download it to open the file.'
                : 'This PDF has no inline-renderable source yet. Download it to view the file.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pdfError && (
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </Button>
            )}
            {pdfDownload && (
              <Button variant="outline" size="sm" onClick={pdfDownload}>
                <Download className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                Download
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderImagePreview = (containerClassName: string) => (
    <div
      className={cn(
        'flex items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,hsl(var(--muted))_0,transparent_70%)] p-4',
        containerClassName,
      )}
    >
      {imageSrc && !imageError ? (
        <img
          key={`${imageSrc}-${refreshKey}`}
          src={imageSrc}
          alt={artifact.title || 'Generated image'}
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
        />
      ) : (
        <div
          className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 px-6 text-center"
          data-testid="artifact-image-fallback"
        >
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {imageError ? "This image couldn't be displayed." : 'Image preview unavailable'}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {imageError
              ? 'The image failed to load. Retry the preview or download the file.'
              : 'This artifact does not contain a supported image source.'}
          </p>
        </div>
      )}
    </div>
  );

  const canRequestEdits =
    variant === 'panel' &&
    Boolean(onRequestEdits) &&
    canPreview &&
    isLatestVersion &&
    activeTab === 'preview' &&
    !showChanges &&
    sourceDraft === null &&
    !renderError &&
    activeContent.trim().length > 0 &&
    getSandboxOrigin() !== null;

  useEffect(() => {
    if (!canRequestEdits) {
      setEditRequestMode(false);
      setPickerSelection(null);
    }
  }, [canRequestEdits]);

  const startEditRequest = useCallback(() => {
    setPickerSelection(null);
    setEditRequestMode((active) => !active);
  }, []);

  const cancelEditRequest = useCallback(() => {
    setEditRequestMode(false);
    setPickerSelection(null);
  }, []);

  const submitEditRequest = useCallback(
    (instruction: string) => {
      if (!pickerSelection || !onRequestEdits) return;
      const sent = onRequestEdits(
        buildArtifactEditRequest({
          title: artifact.title || 'Artifact',
          selection: pickerSelection,
          instruction,
        }),
      );
      if (sent) cancelEditRequest();
      else toast.error('The change request was not sent. Try again.');
    },
    [pickerSelection, onRequestEdits, artifact.title, cancelEditRequest],
  );

  const replaceImage = useCallback(
    async (selector: string, file: File) => {
      try {
        const dataUrl = await embedImageFile(file);
        const stored = useArtifactsStore.getState().artifacts.find((a) => a.id === artifact.id);
        const next = stored ? replaceImageInHtml(stored.content, selector, dataUrl) : null;
        if (!stored || next === null) {
          toast.error('That image could not be found in the source. Ask for the change instead.');
          return;
        }
        upsertArtifact({ ...stored, content: next, createdAt: new Date() });
        cancelEditRequest();
        toast.success('Image replaced. The previous version is in the history.');
      } catch (error) {
        toast.error(
          error instanceof ImageEmbedError
            ? IMAGE_EMBED_FAILURE_COPY[error.failure]
            : 'That image could not be placed.',
        );
      } finally {
        setImageReplaceTarget(null);
      }
    },
    [artifact.id, upsertArtifact, cancelEditRequest],
  );

  const startDocumentEdit = useCallback(() => {
    setSourceDraft(activeContent);
    setDraftOrigin('editor');
    setEditorFocusRequest((count) => count + 1);
  }, [activeContent]);

  const canRequestSelectionEdits =
    variant === 'panel' &&
    Boolean(onRequestEdits) &&
    isStoredArtifact &&
    isLatestVersion &&
    !showChanges &&
    !editRequestMode &&
    !isPdf &&
    !isDocx &&
    !isImage &&
    activeContent.trim().length > 0;

  const requestSelectionEdit = useCallback(
    (selectedText: string, instruction: string, origin: Node) => {
      if (!onRequestEdits) return false;
      const element = origin instanceof Element ? origin : origin.parentElement;
      const slideIndex = element?.closest('[data-slide-index]')?.getAttribute('data-slide-index');
      const current = sourceDraft ?? activeContent;
      const handEdited = sourceDraft !== null || versionCount > 1;
      if (sourceDraft !== null) saveSourceEdit();
      const sent = onRequestEdits(
        buildArtifactSelectionRequest({
          title: artifact.title || 'Artifact',
          selection: captureSelectionContext(current, selectedText),
          instruction,
          ...(slideIndex !== null && slideIndex !== undefined
            ? { scope: `slide ${Number(slideIndex) + 1}` }
            : {}),
          ...(handEdited ? { currentContent: current } : {}),
          ...(artifact.language ? { language: artifact.language } : {}),
          type: artifact.type,
        }),
      );
      if (!sent) toast.error('The change request was not sent. Try again.');
      return sent;
    },
    [
      onRequestEdits,
      sourceDraft,
      activeContent,
      versionCount,
      saveSourceEdit,
      artifact.title,
      artifact.language,
      artifact.type,
    ],
  );

  const canComment = variant === 'panel' && isStoredArtifact && canCommentOn(artifact.id);
  const designBrief = useMemo(
    () => (artifact.type === 'html' && variant === 'panel' ? readDesignBrief(activeContent) : null),
    [artifact.type, variant, activeContent],
  );
  const openCommentAnchors = useMemo(
    () =>
      artifactComments
        .filter((comment) => !comment.parentId && comment.resolvedAt === null)
        .map((comment) => comment.anchor),
    [artifactComments],
  );
  const highlightRevision = `${activeContent.length}:${activeTab}:${sourceDraft === null}:${commentsOpen}`;
  useCommentHighlights(contentAreaRef, canComment ? openCommentAnchors : [], highlightRevision);

  const startComment = useCallback(
    (selectedText: string, origin: Node) => {
      const element = origin instanceof Element ? origin : origin.parentElement;
      const slide = element?.closest('[data-slide-index]')?.getAttribute('data-slide-index');
      const context = captureSelectionContext(activeContent, selectedText);
      setCommentDraft({
        kind: 'text',
        quote: context.text,
        prefix: context.before.slice(-200),
        suffix: context.after.slice(0, 200),
        ...(slide !== null && slide !== undefined ? { slide: Number(slide) } : {}),
      });
      setCommentsOpen(true);
    },
    [activeContent],
  );

  const editRequestPicker = useMemo(
    () => ({
      active: editRequestMode,
      onSelect: setPickerSelection,
      onCancel: cancelEditRequest,
      onUnavailable: () => {
        cancelEditRequest();
        toast.error('Selecting content needs the sandboxed preview, which is unavailable here.');
      },
    }),
    [editRequestMode, cancelEditRequest],
  );

  if (variant === 'panel') {
    // Whether to show the preview content (vs source code)
    const showPreview = !showChanges && activeTab === 'preview' && hasPreviewSurface;
    // Human-readable type label for the toolbar, e.g. "· HTML", "· MD".
    // For code/document artifacts the type alone is generic ("CODE"/"DOCUMENT");
    // prefer the language field which carries the actual format (ts, md, pdf...).
    const typeLabel =
      artifact.type === 'code' || artifact.type === 'document'
        ? (artifact.language ?? artifact.type).toUpperCase()
        : artifact.type.toUpperCase();

    const isBinaryDownload = isPdf || isDocx || isImage;
    const moreMenuItems: ArtifactMenuItem[] = [];
    if (canRequestEdits) {
      moreMenuItems.push({
        id: 'request-edits',
        label: REQUEST_EDITS_LABEL,
        icon: MousePointerClick,
        onSelect: startEditRequest,
        className: NARROW_ONLY_ITEM_CLASS,
        testId: 'artifact-request-edits-menu',
      });
    }
    if (showEditSteps) {
      moreMenuItems.push(
        {
          id: 'undo-edit',
          label: 'Undo',
          icon: Undo2,
          disabled: !canUndoEdit,
          ariaLabel: UNDO_EDIT_LABEL,
          onSelect: undoEdit,
          className: EDIT_STEP_NARROW_ONLY_ITEM_CLASS,
        },
        {
          id: 'redo-edit',
          label: 'Redo',
          icon: Redo2,
          disabled: !canRedoEdit,
          ariaLabel: REDO_EDIT_LABEL,
          onSelect: redoEdit,
          className: EDIT_STEP_NARROW_ONLY_ITEM_CLASS,
        },
      );
    }
    if (publishArtifact) {
      moreMenuItems.push({
        id: 'publish',
        label: isPublishing ? 'Publishing…' : 'Publish',
        icon: Globe,
        disabled: isPublishing,
        onSelect: () => void handlePublish(),
        className: NARROW_ONLY_ITEM_CLASS,
      });
    }
    if (canEditSource && (!showPreview || isMarkdownDoc) && !showChanges && sourceDraft === null) {
      moreMenuItems.push({
        id: 'edit-source',
        label: 'Edit source',
        icon: Pencil,
        onSelect: startDocumentEdit,
        ariaLabel: 'Edit artifact source',
        testId: 'artifact-edit-source',
      });
    }
    if (canShowChanges && isTextDocument && isLatestVersion && canEditSource) {
      moreMenuItems.push({
        id: 'review-changes',
        label: 'Review changes',
        icon: ListChecks,
        onSelect: () => setReviewingKey(changesKey),
        testId: 'artifact-review-changes',
      });
    }
    if (canShowChanges) {
      moreMenuItems.push({
        id: 'show-changes',
        label: showChanges ? 'Hide changes' : 'Show changes',
        icon: FileDiff,
        onSelect: () => setChangesShownFor(showChanges ? null : changesKey),
        testId: 'artifact-show-changes',
      });
    }
    if (!isLatestVersion) {
      moreMenuItems.push({
        id: 'restore-version',
        label: `Restore version ${shownVersionIndex + 1}`,
        icon: History,
        onSelect: () => requestRestore(shownVersionIndex),
        testId: 'artifact-restore-version',
      });
    }
    if (canPreview || isPdf || isImage) {
      moreMenuItems.push({
        id: 'refresh',
        label: 'Refresh preview',
        icon: RefreshCw,
        onSelect: handleRefresh,
      });
    }
    if (canPreview || isMermaid) {
      moreMenuItems.push({
        id: 'open-in-new-tab',
        label: 'Open in new tab',
        icon: ExternalLink,
        onSelect: handleOpenInNewTab,
      });
    }
    if (isBinaryDownload) {
      moreMenuItems.push({
        id: 'download-file',
        label: isImage ? 'Download image' : 'Download file',
        icon: Download,
        group: 'Download',
        disabled: isImage && !imageSrc,
        onSelect: isImage
          ? () => void handleDownloadImage()
          : generatedFileSummary.primaryUri
            ? () => void handleDownloadGeneratedFile()
            : handleDownloadBinaryDoc,
      });
    } else {
      const downloads: Array<{ id: string; label: string; run: () => void }> = [];
      if (isTabular)
        downloads.push({ id: 'csv', label: 'Download as CSV', run: handleDownloadCsv });
      if (isMermaid && mermaidSvg) {
        downloads.push({ id: 'svg', label: 'Download as SVG', run: handleDownloadMermaidSvg });
      }
      downloads.push(
        { id: 'html', label: 'Download as HTML', run: () => handleDownload('html') },
        {
          id: 'source',
          label: `Download source (.${(artifact.language || 'txt').toLowerCase()})`,
          run: () => handleDownload('txt'),
        },
        { id: 'md', label: 'Download as Markdown', run: () => handleDownload('md') },
      );
      if (isPresentation) {
        downloads.push({
          id: 'deck-pdf',
          label: 'Download as PDF',
          run: () => void handleExportDeckPdf(),
        });
      }
      if (isTextDocument) {
        downloads.push(
          {
            id: 'docx',
            label: 'Download as Word (.docx)',
            run: () => void handleExportDocument('docx'),
          },
          { id: 'pdf', label: 'Download as PDF', run: () => void handleExportDocument('pdf') },
        );
      }
      if (hasGeneratedFileManifest && generatedFileSummary.primaryUri) {
        downloads.push({
          id: 'generated',
          label: 'Download generated file',
          run: () => void handleDownloadGeneratedFile(),
        });
      }
      downloads.forEach((download) =>
        moreMenuItems.push({
          id: `download-${download.id}`,
          label: download.label,
          icon: Download,
          group: 'Download',
          onSelect: download.run,
        }),
      );
    }
    if (designBrief && onRequestEdits && isLatestVersion) {
      moreMenuItems.push({
        id: 'design-brief',
        label: 'Design brief',
        icon: PenTool,
        testId: 'artifact-design-brief',
        onSelect: () => setBriefOpen(true),
      });
    }
    if (variant === 'panel' && isStoredArtifact && (isMarkdownDoc || isPresentation)) {
      moreMenuItems.push({
        id: 'save-template',
        label: 'Save as template',
        icon: LayoutTemplate,
        group: 'Keep',
        testId: 'artifact-save-template',
        onSelect: () => setTemplateDialogOpen(true),
      });
    }
    if (isTextDocument && isMarkdownDoc && variant === 'panel') {
      moreMenuItems.push({
        id: 'save-google-docs',
        label: savingToGoogleDocs ? 'Saving to Google Docs…' : 'Save to Google Docs',
        icon: FileText,
        group: 'Keep',
        disabled: savingToGoogleDocs,
        testId: 'artifact-save-google-docs',
        onSelect: () => void handleSaveToGoogleDocs(),
      });
    }
    if (isTextDocument && onRequestEdits && isLatestVersion) {
      savedBrands.forEach(({ id, name, brand }) =>
        moreMenuItems.push({
          id: `apply-brand-${id}`,
          label: name,
          icon: Palette,
          group: 'Apply brand voice',
          testId: 'artifact-apply-brand',
          onSelect: () => {
            if (
              !onRequestEdits(buildApplyBrandRequest(artifact.title || 'Document', name, brand))
            ) {
              toast.error('The change request was not sent. Try again.');
            }
          },
        }),
      );
    }
    if (variant === 'panel' && isStoredArtifact) {
      moreMenuItems.push(
        {
          id: 'rename',
          label: RENAME_ARTIFACT_LABEL,
          icon: TextCursorInput,
          group: 'Keep',
          testId: 'artifact-rename',
          onSelect: () => setRenaming(true),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: GitFork,
          group: 'Keep',
          ariaLabel: 'Duplicate this artifact',
          testId: 'artifact-fork',
          onSelect: () => {
            const forkId = forkArtifact(artifact.id, activeContent);
            if (!forkId) {
              toast.error('That artifact could not be duplicated');
              return;
            }
            setSourceDraft(null);
            setViewedVersionIndex(null);
            toast.success('Duplicated. Edits here no longer touch the original.');
          },
        },
        {
          id: 'start-work',
          label: 'Start Work',
          icon: Sparkles,
          group: 'Keep',
          ariaLabel: WORK_ENTRY_POINT_LABELS.artifact,
          testId: 'artifact-start-work',
          onSelect: () =>
            startWork({
              source: {
                entryPoint: 'artifact',
                title: artifact.title || 'Untitled artifact',
                reference: `artifacts/${artifact.id}`,
              },
            }),
        },
      );
    }
    if (!hasGeneratedFileManifest && !isImage && !isPdf && !isDocx) {
      moreMenuItems.push({
        id: 'save-to-library',
        label: savingToLibrary ? 'Saving…' : 'Save to Library',
        icon: Library,
        group: 'Keep',
        disabled: savingToLibrary,
        ariaLabel: 'Save this artifact to your Library',
        testId: 'artifact-save-to-library',
        onSelect: () => void handleSaveToLibrary(),
      });
    }
    if (projectSave && projectSave.projects.length > 0) {
      projectSave.projects.forEach((project) =>
        moreMenuItems.push({
          id: `save-to-project-${project.id}`,
          label: project.name,
          icon: FolderPlus,
          group: 'Save to project',
          disabled: savingProjectId !== null,
          testId: 'artifact-save-to-project',
          onSelect: () => void handleSaveToProject(project),
        }),
      );
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          'flex h-full min-h-0 flex-col',
          isFullscreen && 'fixed inset-0 z-[var(--z-modal)] bg-background',
          className,
        )}
      >
        {/* @container: this header sizes to the ARTIFACT PANEL, not the viewport.
            The panel is a fixed-width split pane the reader can drag narrow
            while the window stays wide, so viewport breakpoints told labels to
            render at a width the panel never has. Only the actions that earn a
            slot stay here (request edits, copy, publish, expand, close); the
            rest live in the More menu, so nothing wraps, clips or hides at
            400px or at phone width. Request edits and Publish also sit in the
            menu below the container width where their buttons are hidden. */}
        <div className="@container flex shrink-0 items-center gap-2 border-b border-border/30 bg-card/80 px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Eye/Code segmented toggle, for renderable artifacts (sandbox)
                and shared-renderer types (spreadsheet/presentation/email).
                PDF/DOCX are single-view (their "source" is an opaque data URI),
                so they get no toggle per the claude.ai artifact header. */}
            {(canPreview || isMermaid || isSharedRendered || isMarkdownDoc) && (
              <div className="flex shrink-0 items-center rounded-md border border-border/40 bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('preview');
                    setChangesShownFor(null);
                  }}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-compact transition-colors',
                    activeTab === 'preview' && !showChanges
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Preview"
                  title="Preview"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('code');
                    setChangesShownFor(null);
                  }}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-compact transition-colors',
                    activeTab === 'code' && !showChanges
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Source"
                  title="Source"
                >
                  <Code className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {/* Title over a muted line holding the type and the version
                stepper, Claude's arrangement. min-w-0 is what makes `truncate`
                engage on a flex child. */}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <ArtifactTitleField
                title={artifact.title || 'Artifact'}
                editing={renaming}
                canRename={isStoredArtifact}
                onStartEditing={() => setRenaming(true)}
                onRename={(title) => {
                  if (!renameArtifact(artifact.id, title))
                    toast.error('That name could not be saved');
                }}
                onDone={() => setRenaming(false)}
              />
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <TypeIcon type={artifact.type} className="h-3 w-3 shrink-0" />
                <span className="truncate">{typeLabel}</span>
                {showVersionChip && (
                  <div
                    className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-muted/40 px-0.5"
                    data-testid="artifact-version-chip"
                  >
                    <button
                      type="button"
                      onClick={() => stepVersion(versionTimeline.previous)}
                      disabled={!versionTimeline.previous}
                      className="flex h-5 w-5 items-center justify-center rounded-compact text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                      aria-label="Previous version"
                      title="Previous version"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      ref={historyToggleRef}
                      type="button"
                      onClick={() => (historyOpen ? closeHistory() : setHistoryOpen(true))}
                      disabled={versionCount === 0}
                      aria-expanded={historyOpen}
                      aria-controls={
                        historyOpen ? `artifact-version-history-${artifact.id}` : undefined
                      }
                      aria-label={`Version ${versionTimeline.position} of ${versionTimeline.total}. Show version history`}
                      title="Version history"
                      className={cn(
                        'min-w-[2.5rem] rounded-compact text-center text-xs tabular-nums transition-colors hover:text-foreground',
                        historyOpen ? 'text-foreground' : 'text-muted-foreground',
                      )}
                      data-testid="artifact-version-history-toggle"
                    >
                      <span aria-live="polite">
                        v{versionTimeline.position}/{versionTimeline.total}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stepVersion(versionTimeline.next)}
                      disabled={!versionTimeline.next}
                      className="flex h-5 w-5 items-center justify-center rounded-compact text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                      aria-label="Next version"
                      title="Next version"
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {modifiedLabel && shownVersionModifiedAt && (
                  <time
                    dateTime={shownVersionModifiedAt}
                    title={new Date(shownVersionModifiedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    className="min-w-0 truncate"
                    data-testid="artifact-last-modified"
                  >
                    Last modified {modifiedLabel}
                  </time>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1">
            {/* Save · Cancel stay in view while a source edit is open: the
                reader is mid-task and both end it. Starting an edit is in the
                More menu (see canEditSource). */}
            {sourceDraft !== null &&
              canEditSource &&
              (!showPreview || isMarkdownDoc) &&
              !showChanges && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveSourceEdit}
                    className="h-7 px-2"
                    aria-label="Save artifact source"
                    title="Save as a new version"
                    data-testid="artifact-save-source"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span className="ms-1 hidden text-xs @[30rem]:inline">Save</span>
                  </Button>
                  {draftStatus ? (
                    <span
                      className="hidden text-xs text-muted-foreground @[30rem]:inline"
                      role="status"
                    >
                      {draftStatus === 'saved' ? 'Draft kept on this device' : 'Draft not kept'}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={endSourceEdit}
                    className="h-7 px-2"
                    aria-label="Discard artifact source edit"
                    title="Discard changes"
                    data-testid="artifact-cancel-source-edit"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="ms-1 hidden text-xs @[30rem]:inline">Cancel</span>
                  </Button>
                </>
              )}

            {canEditSource && isMarkdownDoc && showPreview && sourceDraft === null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={startDocumentEdit}
                className="h-7 px-2"
                aria-label="Edit document"
                title="Edit"
                data-testid="artifact-edit-document"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="ms-1 hidden text-xs @[30rem]:inline">Edit</span>
              </Button>
            )}

            {canComment && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommentsOpen((open) => !open)}
                className={cn('h-7 px-2', commentsOpen && 'bg-muted text-foreground')}
                aria-pressed={commentsOpen}
                aria-label={
                  openCommentAnchors.length > 0
                    ? `${COMMENTS_LABEL}, ${openCommentAnchors.length} open`
                    : COMMENTS_LABEL
                }
                title={COMMENTS_LABEL}
                data-testid="artifact-comments-toggle"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {openCommentAnchors.length > 0 ? (
                  <span className="ms-1 text-xs tabular-nums">{openCommentAnchors.length}</span>
                ) : null}
              </Button>
            )}

            {canRequestEdits && (
              <Button
                variant="ghost"
                size="sm"
                onClick={startEditRequest}
                className={cn(
                  'hidden h-7 px-2 @[26rem]:inline-flex',
                  editRequestMode && 'bg-muted text-foreground',
                )}
                aria-pressed={editRequestMode}
                aria-label={REQUEST_EDITS_LABEL}
                title={REQUEST_EDITS_LABEL}
                data-testid="artifact-request-edits"
              >
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}

            {showEditSteps && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undoEdit}
                  disabled={!canUndoEdit}
                  className="hidden h-7 px-2 @[24rem]:inline-flex"
                  aria-label={UNDO_EDIT_LABEL}
                  title={UNDO_EDIT_LABEL}
                  data-testid="artifact-undo"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={redoEdit}
                  disabled={!canRedoEdit}
                  className="hidden h-7 px-2 @[24rem]:inline-flex"
                  aria-label={REDO_EDIT_LABEL}
                  title={REDO_EDIT_LABEL}
                  data-testid="artifact-redo"
                >
                  <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </>
            )}

            {/* Copy, not for binary docs (copying a data URI is useless). */}
            {!isPdf && !isDocx && !isImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCopy()}
                className="h-7 px-2"
                aria-label={copied ? 'Copied' : 'Copy artifact'}
                title="Copy"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success-text" />
                    <span className="ms-1 hidden text-xs @[30rem]:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="ms-1 hidden text-xs @[30rem]:inline">Copy</span>
                  </>
                )}
              </Button>
            )}

            {publishArtifact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handlePublish()}
                disabled={isPublishing}
                className="hidden h-7 px-2 @[26rem]:inline-flex"
                aria-label="Publish artifact to a public link"
                title="Publish"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="ms-1 hidden text-xs @[34rem]:inline">
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleFullscreen}
              className="h-7 px-2"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Expand'}
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>

            <ArtifactMoreMenu items={moreMenuItems} />

            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 w-7 p-0"
                aria-label="Close artifact viewer"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* The turn was stopped before this artifact finished, so the panel is
            showing a fragment. Saying so is the point: the content looks like a
            whole document and a reader who copies or publishes it would carry
            the truncation with them. */}
        {artifact.interrupted && (
          <div
            className="flex shrink-0 items-center gap-2 border-b px-4 py-2"
            style={{
              borderColor: 'var(--chat-warning-border)',
              background: 'var(--chat-warning-bg)',
              color: 'var(--chat-warning-fg)',
            }}
            data-testid="artifact-interrupted-notice"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 text-xs">{INTERRUPTED_ARTIFACT_NOTICE}</span>
          </div>
        )}

        {historyOpen && versionHistory && versionCount > 0 && (
          <ArtifactVersionHistory
            id={`artifact-version-history-${artifact.id}`}
            versions={versionHistory}
            shownIndex={shownVersionIndex}
            onOpen={(index) => setViewedVersionIndex(index === versionCount - 1 ? null : index)}
            onRestore={requestRestore}
            onClose={closeHistory}
          />
        )}

        {projectLink && (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border/30 px-4 py-2"
            data-testid="artifact-project-link"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">In project</span>
            <a
              href={`/chat/projects/${encodeURIComponent(projectLink.id)}`}
              className="min-w-0 flex-1 truncate text-xs text-primary underline-offset-2 hover:underline"
            >
              {projectLink.name}
            </a>
          </div>
        )}

        {shownPublishedUrl && (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/30 bg-muted/20 px-4 py-2"
            data-testid="artifact-published-url"
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a
              href={shownPublishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-primary underline-offset-2 hover:underline"
            >
              {shownPublishedUrl}
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                void writeToClipboard(shownPublishedUrl).then((ok) => {
                  if (ok) toast.success('Link copied');
                  else toast.error('Could not copy the link');
                });
              }}
            >
              Copy link
            </Button>
            {artifactAudience && (
              <div className="flex w-full items-center gap-2" data-testid="artifact-audience">
                <label htmlFor="artifact-audience-select" className="text-xs text-muted-foreground">
                  Who can open this
                </label>
                <select
                  id="artifact-audience-select"
                  value={artifactAudience.current}
                  disabled={isChangingAudience}
                  onChange={(event) =>
                    handleChangeAudience(
                      event.target.value === 'organization' || event.target.value === 'invited'
                        ? event.target.value
                        : 'public',
                    )
                  }
                  className="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
                >
                  <option value="public">Anyone with the link</option>
                  {artifactAudience.memberCount !== null && (
                    <option value="organization">
                      Everyone in this workspace ({artifactAudience.memberCount})
                    </option>
                  )}
                  <option value="invited">Only people you invite</option>
                </select>
              </div>
            )}
            {artifactAudience?.current === 'invited' && publishedToken && (
              <div className="w-full" data-testid="artifact-invited-viewers">
                <SiteViewersEditor token={publishedToken} />
              </div>
            )}
          </div>
        )}

        {securityNotice && (
          <Alert className="m-4 shrink-0 border-warning-fill/40 bg-warning-fill/10">
            <Shield className="h-4 w-4 text-warning-text" />
            <AlertDescription className="text-warning-text">
              <strong>Security Notice:</strong> {SECURITY_NOTICE_TEXT}
            </AlertDescription>
          </Alert>
        )}

        {hasGeneratedFileManifest && (
          <div className="shrink-0 border-b border-border bg-muted/10 px-4 py-3">
            <GeneratedFileCard
              presentation={generatedFileSummary}
              onDownload={
                generatedFileSummary.primaryUri
                  ? () => void handleDownloadGeneratedFile()
                  : undefined
              }
              onShare={
                generatedFileSummary.canShare ? () => void handleShareGeneratedFile() : undefined
              }
            />
            {generatedFileSummary.localOnly && (
              <p className="mt-2 text-caption text-muted-foreground">
                Local file. Web shares a reference only; it is not uploaded.
              </p>
            )}
          </div>
        )}

        {live.host && <LiveArtifactControls live={live} />}

        {/* Content area, fills remaining height. min-h-0 prevents a flex-child
            from refusing to shrink below its content height (iframe collapse). */}
        <div
          ref={contentAreaRef}
          className={cn(
            'relative flex flex-1 min-h-0 flex-col overflow-hidden',
            commentStyles['highlightScope'],
          )}
        >
          <input
            ref={imageReplaceInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            data-testid="artifact-replace-image-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file && imageReplaceTarget) void replaceImage(imageReplaceTarget, file);
            }}
          />
          {reviewingKey === changesKey && previousVersionContent !== undefined && (
            <div className="absolute inset-0 z-[var(--z-content-raised)] bg-background">
              <ArtifactChangesReview
                previous={previousVersionContent}
                next={activeContent}
                fromVersion={shownVersionIndex}
                toVersion={shownVersionIndex + 1}
                onClose={() => setReviewingKey(null)}
                onApply={(text) => {
                  saveArtifactContent(text);
                  setReviewingKey(null);
                  toast.success('Saved your choices as a new version');
                }}
              />
            </div>
          )}
          {canComment && commentsOpen && (
            <ArtifactCommentsPanel
              artifactId={artifact.id}
              title={artifact.title || 'Artifact'}
              artifactType={artifact.type}
              draftAnchor={commentDraft}
              onDraftDone={() => setCommentDraft(null)}
              onClose={() => {
                setCommentsOpen(false);
                setCommentDraft(null);
              }}
              {...(onRequestEdits && isLatestVersion ? { onRequestEdits } : {})}
              onLocate={(anchor) => {
                if (!scrollToAnchor(contentAreaRef.current, anchor)) {
                  toast.message('That passage is not on screen in this view.');
                }
              }}
            />
          )}
          {canRequestSelectionEdits && (
            <ArtifactSelectionToolbar
              containerRef={contentAreaRef}
              onRequest={requestSelectionEdit}
              {...(canComment ? { onComment: startComment } : {})}
            />
          )}
          {editRequestMode && (
            <ArtifactEditRequestLayer
              selection={pickerSelection}
              onSubmit={submitEditRequest}
              onCancel={cancelEditRequest}
              {...(artifact.type === 'html' && canEditSource
                ? {
                    onReplaceImage: (selection: ArtifactPickerSelection) => {
                      setImageReplaceTarget(selection.selector);
                      imageReplaceInputRef.current?.click();
                    },
                  }
                : {})}
              {...(canComment
                ? {
                    onComment: ({
                      selection,
                      x,
                      y,
                    }: {
                      selection: ArtifactPickerSelection;
                      x: number;
                      y: number;
                    }) => {
                      setCommentDraft({
                        kind: 'element',
                        selector: selection.selector.slice(0, 1_000),
                        text: (selection.text ?? '').slice(0, 2_000),
                        x,
                        y,
                      });
                      cancelEditRequest();
                      setCommentsOpen(true);
                    },
                  }
                : {})}
            />
          )}
          {showChanges && previousVersionContent !== undefined && (
            <ArtifactChangesView
              previous={previousVersionContent}
              next={activeContent}
              unit={isTextDocument || artifact.type === 'email' ? 'word' : 'line'}
              fromVersion={shownVersionIndex}
              toVersion={shownVersionIndex + 1}
            />
          )}

          {/* Preview: HTML / React / SVG, with empty + error states. */}
          {showPreview &&
            canPreview &&
            (activeContent.trim().length === 0 ? (
              // Empty state: a renderable artifact with no content yet (e.g. an
              // opened-but-still-empty draft). Not an error, just nothing to show.
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background px-6 text-center">
                <Code className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              </div>
            ) : renderError ? (
              // Error state: the sandbox reported a render failure. Offer source
              // + retry so the user is never stuck on a blank frame.
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center"
                data-testid="artifact-render-error"
              >
                <AlertTriangle className="h-7 w-7 text-warning-text" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    This artifact couldn&apos;t be rendered.
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{renderError}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('code')}>
                    <Code className="me-1 h-3.5 w-3.5" />
                    View source
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="me-1 h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : sandboxPayload === null ? (
              <PreviewFrameLoading />
            ) : (
              <div className="h-full w-full bg-white">
                <SandboxedIframe
                  payload={sandboxPayload}
                  fallbackSrcDoc={getPreviewHTML()}
                  title={artifact.title || 'Artifact Preview'}
                  className="h-full w-full border-0"
                  refreshKey={refreshKey + live.refreshKey}
                  onRenderError={(err) => setRenderError(err)}
                  picker={editRequestPicker}
                  {...(live.host ? { runtime: live.host } : {})}
                />
              </div>
            ))}

          {/* Preview: Mermaid, client-side renderer, no sandbox iframe needed. */}
          {showPreview &&
            isMermaid &&
            (activeContent.trim().length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background px-6 text-center">
                <Code className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              </div>
            ) : (
              renderMermaidPreview('h-full w-full')
            ))}

          {/* Preview: shared renderers (spreadsheet / presentation / email / chart) */}
          {showPreview && isSharedRendered && renderSharedPreview('h-full w-full')}

          {/* Preview: rendered Markdown document */}
          {showPreview &&
            isMarkdownDoc &&
            (sourceDraft !== null && draftOrigin === 'editor' ? (
              <ArtifactDocumentEditor
                value={sourceDraft}
                onChange={setSourceDraft}
                wraps={MARKDOWN_SHORTCUTS}
              />
            ) : (
              renderMarkdownPreview('h-full w-full')
            ))}

          {/* Preview: PDF */}
          {showPreview && isPdf && renderPdfPreview('h-full w-full')}

          {/* Preview: generated image */}
          {showPreview && isImage && renderImagePreview('h-full w-full')}

          {/* Preview: DOCX */}
          {showPreview && isDocx && (
            <>
              {docxError ? (
                <div className="flex items-center justify-center p-8 text-sm text-danger">
                  Could not render document: {docxError}
                </div>
              ) : docxPreviewHtml ? (
                <iframe
                  title={`${artifact.title || 'DOCX'} document preview`}
                  srcDoc={docxPreviewHtml}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full border-0 bg-background"
                />
              ) : (
                <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                  Converting document...
                </div>
              )}
            </>
          )}

          {/* Source / Code, shown whenever not previewing (or for pure-code artifacts) */}
          {!showPreview &&
            !showChanges &&
            (sourceDraft !== null ? (
              <ArtifactCodeEditor
                value={sourceDraft}
                onChange={setSourceDraft}
                language={isMarkdownDoc ? 'markdown' : (artifact.language ?? artifact.type)}
                wraps={artifact.type === 'document' ? MARKDOWN_SHORTCUTS : undefined}
                ariaLabel="Artifact source"
                focusRequest={editorFocusRequest}
              />
            ) : (
              <ScrollArea className="code-block-body h-full w-full">
                <pre className="overflow-x-visible!">
                  <HighlightedCode code={activeContent} language={sourceLanguage} enabled />
                </pre>
              </ScrollArea>
            ))}
        </div>
        <SaveTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          kind={isPresentation ? 'deck_template' : 'document_template'}
          defaultName={artifact.title || 'Template'}
          title={artifact.title || 'Untitled'}
          content={activeContent}
        />
        <BrandKitDialog
          open={brandApply !== null}
          onOpenChange={(open) => {
            if (!open) setBrandApply(null);
          }}
          onSaved={(item) => {
            if (item.kind === 'brand')
              brandApply?.(brandThemeMeta({ name: item.name, ...(item.payload as BrandPayload) }));
          }}
        />
        {designBrief && onRequestEdits ? (
          <DesignBriefDialog
            open={briefOpen}
            onOpenChange={setBriefOpen}
            initial={designBrief}
            heading="Design brief"
            submitLabel="Update design"
            onSubmit={(brief) => {
              const sent = onRequestEdits(
                buildBriefRevisionRequest(artifact.title || 'Design', brief),
              );
              if (!sent) toast.error('The change request was not sent. Try again.');
              return sent;
            }}
          />
        ) : null}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="artifact-preview-card"
      className={cn(
        'mt-3 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-e3',
        isFullscreen && 'fixed inset-0 z-[var(--z-modal)] rounded-none',
        className,
      )}
    >
      {/* @container: this card can sit inside a narrow chat column. min-w-0 +
          truncate on the title is what lets the left group give way instead
          of pushing the action buttons past the right edge, where they would
          be clipped and unreachable rather than merely hidden. */}
      <div className="@container flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Code className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-sm font-semibold">
              {artifact.title || 'Artifact'}
            </span>
          </div>
          {artifact.type && (
            <span
              data-testid="artifact-type-badge"
              className="shrink-0 rounded-compact bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {artifact.type}
            </span>
          )}
          {hasGeneratedFileManifest && (
            <>
              <span className="hidden shrink-0 rounded-compact bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground @[28rem]:inline">
                {generatedFileSummary.statusLabel}
              </span>
              {generatedFileSummary.privacyShortLabel && (
                <span className="hidden shrink-0 items-center gap-1 rounded-compact bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground @[28rem]:inline-flex">
                  <Shield className="h-3 w-3" />
                  {generatedFileSummary.privacyShortLabel}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2"
              aria-label={copied ? 'Copied' : 'Copy artifact'}
              title="Copy"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success-text" />
                  <span className="ms-1 hidden text-xs @[30rem]:inline">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="ms-1 hidden text-xs @[30rem]:inline">Copy</span>
                </>
              )}
            </Button>
          )}

          {isImage ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownloadImage()}
              disabled={!imageSrc}
              className="h-7 px-2"
              aria-label="Download image"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Download artifact"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isTabular && (
                  <DropdownMenuItem onClick={handleDownloadCsv}>Download as CSV</DropdownMenuItem>
                )}
                {isMermaid && mermaidSvg && (
                  <DropdownMenuItem onClick={handleDownloadMermaidSvg}>
                    Download as SVG
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => handleDownload('html')}>
                  Download as HTML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload('txt')}>
                  Download source (.{(artifact.language || 'txt').toLowerCase()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload('md')}>
                  Download as Markdown
                </DropdownMenuItem>
                {isTextDocument && (
                  <>
                    <DropdownMenuItem onClick={() => void handleExportDocument('docx')}>
                      Download as Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleExportDocument('pdf')}>
                      Download as PDF
                    </DropdownMenuItem>
                  </>
                )}
                {hasGeneratedFileManifest && generatedFileSummary.primaryUri && (
                  <DropdownMenuItem onClick={() => void handleDownloadGeneratedFile()}>
                    Download generated file
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(onShare || hasGeneratedFileManifest) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                hasGeneratedFileManifest ? void handleShareGeneratedFile() : onShare?.()
              }
              className="h-7 px-2"
              aria-label="Share artifact"
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}

          {canPreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-7 px-2"
              aria-label="Refresh preview"
              title="Refresh preview"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}

          {(canPreview || isMermaid) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInNewTab}
              className="hidden h-7 px-2 @[22rem]:flex"
              aria-label="Open source in new tab"
              title="Open source in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className={isFullscreen ? 'flex h-7 px-2' : 'hidden h-7 px-2 @[22rem]:flex'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title="Fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {securityNotice && (
        <Alert className="m-4 border-warning-fill/40 bg-warning-fill/10">
          <Shield className="h-4 w-4 text-warning-text" />
          <AlertDescription className="text-warning-text">
            <strong>Security Notice:</strong> {SECURITY_NOTICE_TEXT}
          </AlertDescription>
        </Alert>
      )}

      {hasGeneratedFileManifest && (
        <div className="border-b border-border bg-muted/10 px-4 py-3">
          <GeneratedFileCard
            presentation={generatedFileSummary}
            onDownload={
              generatedFileSummary.primaryUri ? () => void handleDownloadGeneratedFile() : undefined
            }
            onShare={
              generatedFileSummary.canShare ? () => void handleShareGeneratedFile() : undefined
            }
          />
          {generatedFileSummary.localOnly && (
            <p className="mt-2 text-caption text-muted-foreground">
              Local file. Web shares a reference only; it is not uploaded.
            </p>
          )}
        </div>
      )}

      <Tabs
        value={hasPreviewSurface ? activeTab : 'code'}
        onValueChange={(v) => setActiveTab(v as 'preview' | 'code')}
        className="w-full"
      >
        {(canPreview || isMermaid || isPdf || isDocx || isSharedRendered || isMarkdownDoc) && (
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-muted/30 px-4">
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="h-3.5 w-3.5" />
              Code
            </TabsTrigger>
          </TabsList>
        )}

        {/* Preview Tab · HTML/React/SVG */}
        {canPreview && (
          <TabsContent value="preview" className="m-0 p-0">
            <div className={cn('bg-white', isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}>
              {renderError ? (
                <div
                  className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center"
                  data-testid="artifact-render-error"
                >
                  <AlertTriangle className="h-7 w-7 text-warning-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      This artifact couldn&apos;t be rendered.
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">{renderError}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('code')}>
                      <Code className="me-1 h-3.5 w-3.5" />
                      View source
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleRefresh}>
                      <RefreshCw className="me-1 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                </div>
              ) : sandboxPayload === null ? (
                <PreviewFrameLoading />
              ) : (
                <SandboxedIframe
                  payload={sandboxPayload}
                  fallbackSrcDoc={getPreviewHTML()}
                  title={artifact.title || 'Artifact Preview'}
                  className="h-full w-full border-0"
                  refreshKey={refreshKey}
                  onRenderError={setRenderError}
                />
              )}
            </div>
          </TabsContent>
        )}

        {/* Preview Tab · Mermaid, client-side renderer, no sandbox iframe. */}
        {isMermaid && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderMermaidPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          </TabsContent>
        )}

        {/* Preview Tab · shared renderers (spreadsheet / presentation / email / chart) */}
        {isSharedRendered && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderSharedPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          </TabsContent>
        )}

        {/* Preview Tab · rendered Markdown document */}
        {isMarkdownDoc && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderMarkdownPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          </TabsContent>
        )}

        {/* Preview Tab · PDF inline viewer */}
        {isPdf && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderPdfPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]')}
          </TabsContent>
        )}

        {/* Preview Tab · generated image */}
        {isImage && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderImagePreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]')}
          </TabsContent>
        )}

        {/* Preview Tab · DOCX viewer via mammoth */}
        {isDocx && (
          <TabsContent value="preview" className="m-0 p-0">
            {docxError ? (
              <div className="flex items-center justify-center p-8 text-sm text-danger">
                Could not render document: {docxError}
              </div>
            ) : docxPreviewHtml ? (
              <iframe
                title={`${artifact.title || 'DOCX'} document preview`}
                srcDoc={docxPreviewHtml}
                sandbox=""
                referrerPolicy="no-referrer"
                className={cn(
                  'w-full border-0 bg-background',
                  isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]',
                )}
              />
            ) : (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Converting document...
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="code" className="m-0 p-0">
          <ScrollArea
            tabIndex={0}
            role="region"
            aria-label="Artifact source"
            className={cn(
              'code-block-body',
              isFullscreen
                ? 'h-[calc(100vh-100px)]'
                : hasPreviewSurface
                  ? 'h-[500px]'
                  : 'max-h-[500px]',
            )}
          >
            <pre className="overflow-x-visible!">
              <HighlightedCode code={activeContent} language={sourceLanguage} enabled />
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      {confirmDialog}
    </div>
  );
}
