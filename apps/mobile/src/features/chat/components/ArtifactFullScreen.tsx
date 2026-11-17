import {
  View,
  ScrollView,
  Modal,
  Share,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import * as Haptics from 'expo-haptics';
import { preferredNotificationHaptic } from '@/src/shared/utils/haptics';
import {
  X,
  Copy,
  Check,
  Share2,
  Eye,
  Download,
  Globe,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react-native';
import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { detectArtifactType } from '@agiworkforce/artifacts';
import { toggleMarkdownTask } from '@agiworkforce/unified-chat/task-list';
import { artifactReplyFormat } from '@agiworkforce/unified-chat/artifact-edit-request';
import { prefillComposer } from '@/src/features/chat/store/composerPrefillStore';
import { isAllowedExternalUrl, openExternalUrl } from '@/lib/safeOpenURL';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { useArtifactStore } from '@/src/features/artifacts/store';
import {
  discardArtifactDraft,
  keepArtifactDraft,
  readArtifactDraft,
} from '@/src/features/artifacts/artifactDrafts';
import {
  canSaveArtifactToLibrary,
  saveArtifactToLibrary,
} from '@/src/features/artifacts/libraryService';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import {
  capturePostUnpublishAudienceReconciliation,
  fetchArtifactPublication,
  publishArtifact,
  publishFailureMessage,
  isPublicationOutcomeUncertain,
  LOCAL_MODE_PUBLISH_PROMPT,
  recordPublishedArtifactAudience,
  type ArtifactPublication,
} from '../services/artifactPublishing';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { shareFile, downloadGeneratedFile, downloadFailureMessage } from '@/services/fileCreation';
import {
  DRAWN_DIAGRAM_EXPORT,
  artifactExportOptions,
  exportArtifact,
} from '@/src/features/chat/utils/artifactExport';
import { ArtifactExportSheet } from './ArtifactExportSheet';
import {
  expandCodeTabs,
  tokenizeCode,
  syntaxTokenColor,
  type SyntaxToken,
} from '@/src/features/chat/utils/syntaxHighlight';
import { lineNumberLabels, splitTokensIntoLines } from '@/src/features/chat/utils/sourceLines';
import { withoutArtifactMarker } from '@/src/features/chat/utils/artifactMarker';
import { useCodePreferences } from '@/src/features/settings/code/store';
import {
  FULL_SCREEN_TOUCH_TARGET,
  useFullScreenChrome,
} from '@/src/features/chat/chrome/fullScreenChrome';
import type { Artifact } from '@/types/chat';
import { ArtifactSwitcher } from './ArtifactSwitcher';
import { renderMarkdownContent } from './MessageContentRenderer';
import { ChartArtifactView } from './ChartArtifactView';
import { MermaidDiagramView } from './MermaidDiagramView';
import { ResearchSourcesAppendix } from './research/ResearchSourcesAppendix';
import {
  ArtifactViewer,
  artifactViewerKind,
  viewerSourceForArtifact,
} from './artifact-viewers/ArtifactViewer';
import { studyArtifactContent, studyArtifactTitle } from './artifact-viewers/study';
import { artifactDisplayTitle } from '@/src/features/artifacts/artifactTitle';
import { sourcesFromPersistedMetadata } from '@/src/features/chat/utils/messageSources';
import { GeneratedFileCard } from './GeneratedFileCard';
import { CodeLinesScroller } from '@/src/features/settings/code/CodeLinesScroller';
import { SafeArtifactPreview, type PreviewableKind } from './SafeArtifactPreview';
import { ArtifactChangesView } from './ArtifactChangesView';
import {
  ArtifactChangesReview,
  REVIEW_CHANGES_LABEL,
  REVIEW_SAVED_MESSAGE,
} from './ArtifactChangesReview';
import { ArtifactVersionHistorySheet } from './ArtifactVersionHistorySheet';
import { PublishedArtifactControls } from './PublishedArtifactControls';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { ReportSheet, type ReportTarget } from './ReportFlagButton';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';
import { ArtifactDocumentOutline, OUTLINE_MIN_HEADINGS } from './ArtifactDocumentOutline';
import { ChatScrollIntoViewReset } from './cards/ChatScrollIntoView';
import { extractReportSections } from '@/src/features/research/reportSections';

interface ArtifactFullScreenProps {
  artifact: Artifact | null;
  switchable?: Artifact[];
  onSwitch?: (artifact: Artifact) => void;
  visible: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
  conversationId?: string;
  messageId?: string;
  libraryArtifact?: MobileArtifact;
  initialMode?: 'edit';
}

interface LibrarySaveReceipt {
  content: string;
  status: 'saving' | 'saved';
}

const REPORT_THIS_ARTIFACT = 'Report this artifact';
const UNDO_EDIT_LABEL = 'Undo last change';
const REDO_EDIT_LABEL = 'Redo change';
export const ASK_FOR_CHANGES_LABEL = 'Ask for changes';
const DOWNLOAD_FAILED = 'Could not download or share this file. Try again.';

const SOURCE_LINE_HEIGHT = 20;
const SOURCE_FONT_FAMILY = codeFontFamily;

const HEADER_ICON_SIZE = 20;
const ICON_TARGET = {
  width: FULL_SCREEN_TOUCH_TARGET,
  height: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function SourceLineNumbers({ labels }: { labels: readonly string[] }) {
  const colors = useThemeColors();
  return (
    <Text
      testID="artifact-source-line-numbers"
      selectable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        paddingRight: spacing.sm,
        fontSize: typeScale.caption,
        lineHeight: SOURCE_LINE_HEIGHT,
        color: colors.textMuted,
        fontFamily: SOURCE_FONT_FAMILY,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
      }}
    >
      {labels.join('\n')}
    </Text>
  );
}

function artifactReportTarget(
  artifact: Artifact,
  content: string,
  messageId: string | undefined,
  conversationId: string | undefined,
): ReportTarget {
  const reference = `artifact:${artifact.id}`;
  return {
    messageId: messageId ?? reference,
    conversationId: conversationId ?? reference,
    contentExcerpt: [artifact.title, content].filter((part) => part.trim()).join('\n\n'),
    subject: { kind: 'artifact', id: artifact.id },
  };
}

/**
 * SECURITY: `html`, `svg`, `mermaid` and React (`jsx`, `tsx`, `react`) render
 * through {@link SafeArtifactPreview}, the sandboxed WebView under the shared
 * artifact CSP with no bridge to the app.
 */
const REACT_LANGUAGES = new Set(['jsx', 'tsx', 'react']);
const PREVIEWABLE_LANGUAGES = new Set(['html', 'svg', 'mermaid', ...REACT_LANGUAGES]);

const UNLABELLED_MARKUP_LANGUAGES = new Set(['', 'text', 'txt', 'xml']);

function previewLanguage(artifact: Artifact): string {
  const lang = artifact.language?.toLowerCase() ?? '';
  return UNLABELLED_MARKUP_LANGUAGES.has(lang) &&
    artifact.type === 'code' &&
    detectArtifactType(lang, artifact.content) === 'svg'
    ? 'svg'
    : lang;
}

function livePreviewKind(artifact: Artifact): PreviewableKind | null {
  const lang = previewLanguage(artifact);
  if (lang === 'html') return 'html';
  if (lang === 'svg') return 'svg';
  if (lang === 'mermaid') return 'mermaid';
  if (REACT_LANGUAGES.has(lang)) return 'react';
  return null;
}

function inlineViewerKind(artifact: Artifact): 'table' | 'deck' | 'study' | null {
  const source = viewerSourceForArtifact(artifact);
  if (source.origin !== 'inline') return null;
  const kind = artifactViewerKind(source);
  return kind === 'table' || kind === 'deck' || kind === 'study' ? kind : null;
}

function isPreviewable(artifact: Artifact): boolean {
  const lang = previewLanguage(artifact);
  return PREVIEWABLE_LANGUAGES.has(lang) || inlineViewerKind(artifact) !== null;
}

/**
 * True when the source view should render syntax-highlighted monospace. Every
 * other type (document / research / email / chart) carries markdown prose and
 * is rendered through {@link renderMarkdownContent} instead.
 */
function isMonospaceArtifact(artifact: Artifact): boolean {
  return artifact.type === 'code' || PREVIEWABLE_LANGUAGES.has(previewLanguage(artifact));
}

function typeLabel(artifact: Artifact): string {
  const raw = artifact.language ?? artifact.type;
  return raw.toUpperCase();
}

/**
 * Mirrors web's `resolvePublishableKind` against the mobile artifact shape,
 * where every code-ish artifact carries `type: 'code'` and distinguishes
 * itself by `language`. Prose types resolve to `markdown` because the mobile
 * source view already renders them through the markdown renderer.
 * Returns null for kinds `/api/artifacts/publish` has no safe renderer for.
 */
export function publishableKindFor(artifact: Artifact): string | null {
  const lang = previewLanguage(artifact);
  if (lang === 'html') return 'html';
  if (lang === 'svg') return 'svg';
  if (lang === 'mermaid') return 'mermaid';
  if (REACT_LANGUAGES.has(lang)) return 'react';
  if (artifact.type === 'code') return 'code';
  if (artifact.type === 'document' || artifact.type === 'research') {
    return lang === 'txt' || lang === 'text' ? 'text' : 'markdown';
  }
  return null;
}

function canPublish(artifact: Artifact, content: string): boolean {
  return publishableKindFor(artifact) !== null && content.trim().length > 0;
}

async function confirmPublish(title: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Publish to a public link?',
      `“${title}” will be uploaded from this device to AGI Cloud, and anyone with the link can open it.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Publish', style: 'default', onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}

function explainPublishNeedsCloudMode() {
  Alert.alert('Switch to AGI Cloud to publish', LOCAL_MODE_PUBLISH_PROMPT);
}

function offerSignInToPublish(onSignIn: () => void) {
  Alert.alert(
    'Sign in to AGI Cloud to publish',
    'Publishing puts a copy of this artifact on AGI Cloud. Nothing has been uploaded.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign in', style: 'default', onPress: onSignIn },
    ],
  );
}

const TEXT_TARGET = {
  minHeight: FULL_SCREEN_TOUCH_TARGET,
  justifyContent: 'center',
  paddingHorizontal: spacing.sm,
} as const;

type ViewMode = 'source' | 'preview';

function initialViewMode(artifact: Artifact | null): ViewMode {
  return artifact && (livePreviewKind(artifact) || inlineViewerKind(artifact))
    ? 'preview'
    : 'source';
}

export function artifactChangeRequestPrefill(title: string, replyType: string | undefined): string {
  return [
    `Edit the artifact "${title}". Keep everything else as it is, including the title. ${artifactReplyFormat(replyType)}`,
    '',
    'Requested change: ',
  ].join('\n');
}

function moreActionsHint(canEdit: boolean, canRegenerate: boolean): string {
  const actions = [
    ...(canEdit ? ['edit'] : []),
    ...(canRegenerate ? ['regenerate'] : []),
    'report',
  ];
  const listed =
    actions.length === 1
      ? actions[0]!
      : `${actions.slice(0, -1).join(', ')} or ${actions[actions.length - 1]}`;
  return `${listed.charAt(0).toUpperCase()}${listed.slice(1)} this artifact`;
}

function confirmDiscardEdits(title: string, discard: () => void): void {
  Alert.alert('Discard your edits?', `Your changes to “${title}” will be lost.`, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: discard },
  ]);
}

function confirmSaveOverNewerVersion(title: string, save: () => void): void {
  Alert.alert(
    'Save over the newer version?',
    `“${title}” changed while you were editing. Saving makes your edit the latest version, and the newer one stays in the version history.`,
    [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Save anyway', onPress: save },
    ],
  );
}
type PublicationLookupPurpose = 'opening' | 'uncertain-publish' | 'post-unpublish';

function publicationAccountKey(): string {
  const account = captureCloudAccountEpoch();
  return JSON.stringify(account);
}

export function ArtifactFullScreen({
  artifact,
  switchable,
  onSwitch,
  visible,
  onClose,
  onRegenerate,
  conversationId,
  messageId,
  libraryArtifact,
  initialMode,
}: ArtifactFullScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { status: copyStatus, copy } = useCopyAction();
  const [viewModeChoice, setViewModeChoice] = useState<{
    artifactId: string | undefined;
    mode: ViewMode;
  } | null>(null);
  const viewMode =
    viewModeChoice && viewModeChoice.artifactId === artifact?.id
      ? viewModeChoice.mode
      : initialViewMode(artifact);
  const setViewMode = useCallback(
    (mode: ViewMode) => setViewModeChoice({ artifactId: artifact?.id, mode }),
    [artifact?.id],
  );
  const [drawing, setDrawing] = useState<{ source: string; svg: string } | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const moreMenu = useActionMenu();
  const [downloading, setDownloading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const accountKey = useSyncExternalStore(
    subscribeCloudAccountEpochChange,
    publicationAccountKey,
    publicationAccountKey,
  );
  const artifactId = artifact?.id;
  const publicationView = useMemo(
    () => ({ artifactId, visible, appMode, accountKey, account: captureCloudAccountEpoch() }),
    [artifactId, visible, appMode, accountKey],
  );
  const currentView = useRef(publicationView);
  currentView.current = publicationView;
  const publicationSequence = useRef(0);
  const publicationMutation = useRef<{
    view: typeof publicationView;
    token: number;
  } | null>(null);
  const publicationMounted = useRef(true);
  const isPublicationViewCurrent = useCallback(
    () =>
      publicationMounted.current &&
      currentView.current === publicationView &&
      publicationView.visible &&
      useChatAppModeStore.getState().appMode === publicationView.appMode &&
      (publicationView.account
        ? isCloudAccountEpochCurrent(publicationView.account)
        : captureCloudAccountEpoch() === null),
    [publicationView],
  );
  const [published, setPublished] = useState<{
    view: typeof publicationView;
    publication: ArtifactPublication;
  } | null>(null);
  const [absentView, setAbsentView] = useState<typeof publicationView | null>(null);
  const [uncertainPublishView, setUncertainPublishView] = useState<typeof publicationView | null>(
    null,
  );
  const uncertainRead = useRef<{ view: typeof publicationView; sequence: number } | null>(null);
  const [checkingPublication, setCheckingPublication] = useState(false);
  const [workspaceMemberCount, setWorkspaceMemberCount] = useState<number | null>(null);
  const { status: linkCopyStatus, copy: copyLink } = useCopyAction();
  const [viewedVersionIndex, setViewedVersionIndex] = useState<number | null>(null);
  const [changesShownFor, setChangesShownFor] = useState<string | null>(null);
  const [reviewingFor, setReviewingFor] = useState<string | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  const currentPublication =
    published?.view === publicationView && isPublicationViewCurrent()
      ? published.publication
      : null;
  const publishedUrl = currentPublication?.shareUrl ?? null;
  const publicationKnown = absentView === publicationView && isPublicationViewCurrent();

  const invalidatePublicationLookup = useCallback(() => {
    if (!isPublicationViewCurrent()) return false;
    publicationSequence.current += 1;
    setAbsentView(null);
    return true;
  }, [isPublicationViewCurrent]);

  const beginPublicationMutation = useCallback(() => {
    if (publicationMutation.current?.view === publicationView) return false;
    if (!invalidatePublicationLookup()) return false;
    const token = publicationSequence.current;
    publicationMutation.current = { view: publicationView, token };
    return token;
  }, [invalidatePublicationLookup, publicationView]);

  const isPublicationMutationCurrent = useCallback(
    (token: number) =>
      isPublicationViewCurrent() &&
      publicationMutation.current?.view === publicationView &&
      publicationMutation.current.token === token,
    [isPublicationViewCurrent, publicationView],
  );

  const endPublicationMutation = useCallback(
    (token: number) => {
      if (!isPublicationMutationCurrent(token)) return;
      publicationMutation.current = null;
      setPublishing(false);
    },
    [isPublicationMutationCurrent],
  );

  const loadPublication = useCallback(
    async (id: string, purpose: PublicationLookupPurpose = 'opening') => {
      const uncertainPublish = purpose === 'uncertain-publish';
      if (!isPublicationViewCurrent() || publicationView.account === null) return;
      if (publicationView.appMode !== 'cloud') return;
      if (uncertainPublish && uncertainRead.current?.view === publicationView) return;
      const reconcileAudience =
        purpose === 'post-unpublish' ? capturePostUnpublishAudienceReconciliation(id) : null;
      const sequence = ++publicationSequence.current;
      if (uncertainPublish) {
        uncertainRead.current = { view: publicationView, sequence };
        setCheckingPublication(true);
      }
      setAbsentView(null);
      try {
        const state = await fetchArtifactPublication(id);
        if (!isPublicationViewCurrent() || sequence !== publicationSequence.current) return;
        setWorkspaceMemberCount(state.workspaceMemberCount);
        setPublished(
          state.publication ? { view: publicationView, publication: state.publication } : null,
        );
        setAbsentView(state.publication || uncertainPublish ? null : publicationView);
        if (uncertainPublish && state.publication) {
          recordPublishedArtifactAudience(id, state.publication.visibility);
        } else if (state.publication) {
          reconcileAudience?.(state.publication.visibility);
        }
      } catch (error) {
        if (!isPublicationViewCurrent() || sequence !== publicationSequence.current) return;
        console.warn('[ArtifactFullScreen] publication lookup failed', error);
      } finally {
        if (uncertainPublish && uncertainRead.current?.sequence === sequence) {
          uncertainRead.current = null;
          if (isPublicationViewCurrent()) setCheckingPublication(false);
        }
      }
    },
    [isPublicationViewCurrent, publicationView],
  );

  useEffect(() => {
    publicationMounted.current = true;
    return () => {
      publicationMounted.current = false;
      publicationSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    setPublished(null);
    setAbsentView(null);
    setUncertainPublishView(null);
    setCheckingPublication(false);
    setWorkspaceMemberCount(null);
    setPublishing(false);
    if (
      visible &&
      artifactId &&
      publicationView.account !== null &&
      publicationView.appMode === 'cloud'
    ) {
      void loadPublication(artifactId);
    }
    return () => {
      publicationSequence.current += 1;
    };
  }, [artifactId, loadPublication, publicationView, visible]);
  const versionHistory = useArtifactStore((s) =>
    artifactId ? s.versionsById[artifactId] : undefined,
  );
  const restoreArtifactVersion = useArtifactStore((s) => s.restoreArtifactVersion);
  const storedArtifact = useArtifactStore((s) =>
    artifactId ? s.artifacts.find((candidate) => candidate.id === artifactId) : undefined,
  );
  const saveArtifactEdit = useArtifactStore((s) => s.saveArtifactEdit);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [editBase, setEditBase] = useState<string | null>(null);
  const [editRestored, setEditRestored] = useState(false);
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
  const draftRestoreCheckedFor = useRef<string | null>(null);
  if (editDraft !== null && (!visible || editingArtifactId !== artifactId)) {
    setEditDraft(null);
    setEditBase(null);
    setEditRestored(false);
    setEditingArtifactId(null);
  }
  const versionCount = versionHistory?.length ?? 0;
  const shownVersionIndex = viewedVersionIndex ?? (versionCount > 0 ? versionCount - 1 : 0);
  const activeContent = withoutArtifactMarker(
    versionHistory?.[shownVersionIndex]?.content ?? artifact?.content ?? '',
  );

  useEffect(() => {
    setViewedVersionIndex(null);
  }, [artifactId, versionCount]);

  const generatedFileSummary = useMemo(
    () =>
      summarizeGeneratedFileBundle({
        computeSession: artifact?.computeSession,
        generatedFile: artifact?.generatedFile,
        artifactManifest: artifact?.artifactManifest,
        fallbackFileName: artifact?.title,
        fallbackKind: artifact?.generatedFile?.kind ?? artifact?.language ?? artifact?.type,
        fallbackMimeType: artifact?.generatedFile?.mimeType,
        fallbackUri: artifact?.generatedFile?.uri,
        fallbackStatus:
          (typeof artifact?.metadata?.status === 'string' ? artifact.metadata.status : undefined) ??
          artifact?.computeSession?.status,
      }),
    [artifact],
  );
  const hasGeneratedFileManifest = Boolean(
    artifact?.computeSession || artifact?.generatedFile || artifact?.artifactManifest,
  );
  const previousVersionSource =
    shownVersionIndex > 0 ? versionHistory?.[shownVersionIndex - 1]?.content : undefined;
  const previousVersionContent =
    previousVersionSource === undefined ? undefined : withoutArtifactMarker(previousVersionSource);
  const changesKey = `${artifactId ?? ''}:${shownVersionIndex}:${versionCount}`;
  const canShowChanges = previousVersionContent !== undefined && !hasGeneratedFileManifest;
  if (changesShownFor !== null && (changesShownFor !== changesKey || !canShowChanges)) {
    setChangesShownFor(null);
  }
  const showChanges = canShowChanges && changesShownFor === changesKey;

  const viewerSource = useMemo(
    () => (artifact ? viewerSourceForArtifact({ ...artifact, content: activeContent }) : null),
    [artifact, activeContent],
  );
  const viewerKind = viewerSource ? artifactViewerKind(viewerSource) : null;

  const researchSources = useMemo(
    () => (artifact?.type === 'research' ? sourcesFromPersistedMetadata(artifact.metadata) : []),
    [artifact?.type, artifact?.metadata],
  );
  const sourceTokens = useMemo(
    () =>
      artifact && isMonospaceArtifact(artifact)
        ? expandCodeTabs(tokenizeCode(activeContent, artifact.language))
        : [],
    [artifact, activeContent],
  );
  const sourceLines = useMemo(() => splitTokensIntoLines(sourceTokens), [sourceTokens]);
  const sourceLineNumbers = useMemo(() => lineNumberLabels(sourceLines.length), [sourceLines]);
  const wrapLongLines = useCodePreferences((state) => state.wrapLongLines);
  const [previewRun, setPreviewRun] = useState(0);

  const handleCopy = useCallback(() => {
    if (!artifact) return;
    void copy(activeContent);
  }, [artifact, activeContent, copy]);

  const handleShare = useCallback(async () => {
    if (!artifact) return;

    try {
      const uri = generatedFileSummary.primaryUri;
      if (uri?.startsWith('file://')) {
        await shareFile(uri);
      } else if (artifact.generatedFile && uri && /^https?:\/\//.test(uri)) {
        const localUri = await downloadGeneratedFile(uri, artifact.generatedFile.fileName);
        await shareFile(localUri);
      } else {
        await Share.share({
          title: generatedFileSummary.title,
          message: [
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
            uri,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }
      preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        'Share failed',
        downloadFailureMessage(error, 'This generated file is not available to share right now.'),
      );
    }
  }, [artifact, generatedFileSummary]);

  const handleDownload = useCallback(async () => {
    if (!artifact || downloading) return;
    setDownloading(true);
    try {
      const remoteUri = artifact.generatedFile?.uri;
      if (artifact.generatedFile && remoteUri && /^https?:\/\//.test(remoteUri)) {
        const localUri = await downloadGeneratedFile(remoteUri, artifact.generatedFile.fileName);
        await shareFile(localUri);
      } else {
        const [option, ...others] = artifactExportOptions(artifact, activeContent);
        if (!option) return;
        if (others.length > 0) {
          setExportOpen(true);
          return;
        }
        const drawnSvg = drawing?.source === activeContent ? drawing.svg : null;
        if (drawnSvg) {
          const exportChoice = (body: string, choice: typeof option) => () => {
            void exportArtifact(body, artifact.title, choice)
              .then((uri) => shareFile(uri))
              .then(() => preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success))
              .catch((error: unknown) =>
                Alert.alert('Download failed', downloadFailureMessage(error, DOWNLOAD_FAILED)),
              );
          };
          Alert.alert('Download', undefined, [
            {
              text: DRAWN_DIAGRAM_EXPORT.label,
              onPress: exportChoice(drawnSvg, DRAWN_DIAGRAM_EXPORT),
            },
            { text: option.label, onPress: exportChoice(activeContent, option) },
            { text: 'Cancel', style: 'cancel' },
          ]);
          return;
        }
        await shareFile(await exportArtifact(activeContent, artifact.title, option));
      }
      preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Download failed', downloadFailureMessage(error, DOWNLOAD_FAILED));
    } finally {
      setDownloading(false);
    }
  }, [artifact, activeContent, downloading, drawing]);

  const handlePublish = useCallback(async () => {
    if (!artifact || publishing) return;
    const kind = publishableKindFor(artifact);
    if (!kind) return;
    if (captureCloudAccountEpoch() === null) {
      offerSignInToPublish(() => {
        onClose();
        router.push(beginCloudPostAuthIntent());
      });
      return;
    }
    if (useChatAppModeStore.getState().appMode !== 'cloud') {
      explainPublishNeedsCloudMode();
      return;
    }
    if (!(await confirmPublish(artifact.title))) return;
    const mutation = beginPublicationMutation();
    if (mutation === false) return;
    setPublishing(true);
    try {
      const receipt = await publishArtifact({
        artifactId: artifact.id,
        title: artifact.title,
        kind,
        ...(artifact.language ? { language: artifact.language } : {}),
        content: activeContent,
        ...(conversationId ? { conversationId } : {}),
      });
      if (!isPublicationMutationCurrent(mutation)) return;

      setPublished({
        view: publicationView,
        publication: {
          shareUrl: receipt.shareUrl,
          visibility: receipt.visibility,
        },
      });
      setUncertainPublishView(null);
      setWorkspaceMemberCount(receipt.workspace?.memberCount ?? null);
      recordPublishedArtifactAudience(artifact.id, receipt.visibility);
      try {
        await copyLink(receipt.shareUrl);
      } catch {
        if (isPublicationMutationCurrent(mutation)) {
          Alert.alert(
            'Artifact published',
            'Publishing was confirmed, but copying the link could not be confirmed. You can copy it again below.',
          );
        }
      }
    } catch (err) {
      if (isPublicationMutationCurrent(mutation)) {
        const uncertain = isPublicationOutcomeUncertain(err);
        if (uncertain) {
          setUncertainPublishView(publicationView);
          void loadPublication(artifact.id, 'uncertain-publish');
        }
        Alert.alert(
          uncertain ? 'Publish not confirmed' : 'Publish failed',
          publishFailureMessage(err),
        );
      }
    } finally {
      endPublicationMutation(mutation);
    }
  }, [
    artifact,
    activeContent,
    conversationId,
    copyLink,
    loadPublication,
    onClose,
    publishing,
    router,
    beginPublicationMutation,
    isPublicationMutationCurrent,
    endPublicationMutation,
    publicationView,
  ]);

  const handleRestoreVersion = useCallback(() => {
    if (!artifactId) return;
    if (restoreArtifactVersion(artifactId, shownVersionIndex)) {
      setViewedVersionIndex(null);
      preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    }
  }, [artifactId, restoreArtifactVersion, shownVersionIndex]);

  const handleOpenHistoryVersion = useCallback(
    (index: number) => {
      setViewedVersionIndex(index === versionCount - 1 ? null : index);
      setVersionHistoryOpen(false);
    },
    [versionCount],
  );

  const handleRestoreHistoryVersion = useCallback(
    (index: number) => {
      if (!artifactId) return;
      if (restoreArtifactVersion(artifactId, index)) {
        setViewedVersionIndex(null);
        setVersionHistoryOpen(false);
        preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
      }
    },
    [artifactId, restoreArtifactVersion],
  );

  const [editTrail, setEditTrail] = useState<{
    artifactId: string;
    versionCount: number;
    at: number;
    redo: readonly number[];
  } | null>(null);
  const activeEditTrail =
    editTrail && editTrail.artifactId === artifactId && editTrail.versionCount === versionCount
      ? editTrail
      : null;
  const editBaseIndex = activeEditTrail ? activeEditTrail.at : versionCount - 1;
  const canStepEdits = storedArtifact !== undefined && editDraft === null;
  const canUndoEdit = canStepEdits && versionCount > 1 && editBaseIndex > 0;
  const canRedoEdit = canStepEdits && (activeEditTrail?.redo.length ?? 0) > 0;

  const stepEdit = useCallback(
    (target: number, redo: readonly number[]) => {
      if (!artifactId || !restoreArtifactVersion(artifactId, target)) return;
      const nextCount = useArtifactStore.getState().versionsById[artifactId]?.length ?? 0;
      const dropped = Math.max(0, versionCount + 1 - nextCount);
      setEditTrail({
        artifactId,
        versionCount: nextCount,
        at: target - dropped,
        redo: redo.map((index) => index - dropped).filter((index) => index >= 0),
      });
      setViewedVersionIndex(null);
    },
    [artifactId, restoreArtifactVersion, versionCount],
  );
  const handleUndoEdit = useCallback(() => {
    if (!canUndoEdit) return;
    stepEdit(editBaseIndex - 1, [...(activeEditTrail?.redo ?? []), editBaseIndex]);
  }, [activeEditTrail, canUndoEdit, editBaseIndex, stepEdit]);
  const handleRedoEdit = useCallback(() => {
    const redo = activeEditTrail?.redo ?? [];
    const target = redo[redo.length - 1];
    if (!canRedoEdit || target === undefined) return;
    stepEdit(target, redo.slice(0, -1));
  }, [activeEditTrail, canRedoEdit, stepEdit]);

  const canEditSource =
    storedArtifact !== undefined &&
    !hasGeneratedFileManifest &&
    shownVersionIndex === Math.max(0, versionCount - 1) &&
    activeContent.trim().length > 0;

  const editChanged = editDraft !== null && editDraft !== editBase;
  const editIsStale = editDraft !== null && editBase !== null && activeContent !== editBase;

  const closeEditor = useCallback(() => {
    if (storedArtifact) discardArtifactDraft(storedArtifact.id, storedArtifact.provenance);
    setEditDraft(null);
    setEditBase(null);
    setEditRestored(false);
    setEditingArtifactId(null);
  }, [storedArtifact]);

  const handleStartEdit = useCallback(() => {
    setEditBase(activeContent);
    setEditDraft(activeContent);
    setEditRestored(false);
    setEditingArtifactId(artifactId ?? null);
  }, [activeContent, artifactId]);

  const handleEditChange = useCallback(
    (text: string) => {
      setEditDraft(text);
      if (storedArtifact && editBase !== null) {
        keepArtifactDraft(storedArtifact.id, storedArtifact.provenance, {
          base: editBase,
          content: text,
        });
      }
    },
    [editBase, storedArtifact],
  );

  useEffect(() => {
    if (!visible) {
      draftRestoreCheckedFor.current = null;
      return;
    }
    if (!storedArtifact || !canEditSource || editDraft !== null) return;
    if (draftRestoreCheckedFor.current === storedArtifact.id) return;
    draftRestoreCheckedFor.current = storedArtifact.id;
    const kept = readArtifactDraft(storedArtifact.id, storedArtifact.provenance);
    if (kept && kept.content !== activeContent) {
      setEditBase(kept.base);
      setEditDraft(kept.content);
      setEditRestored(true);
      setEditingArtifactId(storedArtifact.id);
      return;
    }
    if (kept) discardArtifactDraft(storedArtifact.id, storedArtifact.provenance);
    if (initialMode === 'edit') handleStartEdit();
  }, [
    activeContent,
    canEditSource,
    editDraft,
    handleStartEdit,
    initialMode,
    storedArtifact,
    visible,
  ]);

  const handleCancelEdit = useCallback(() => {
    if (editDraft === null) return;
    if (!editChanged) {
      closeEditor();
      return;
    }
    confirmDiscardEdits(artifact?.title ?? '', closeEditor);
  }, [artifact?.title, closeEditor, editChanged, editDraft]);

  const handleSaveEdit = useCallback(() => {
    if (!storedArtifact || editDraft === null) return;
    const save = () => {
      if (editDraft !== activeContent && editDraft.trim().length > 0) {
        saveArtifactEdit({ ...storedArtifact, content: editDraft });
        preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
      }
      closeEditor();
    };
    if (editIsStale && editChanged) {
      confirmSaveOverNewerVersion(storedArtifact.title, save);
      return;
    }
    save();
  }, [
    activeContent,
    closeEditor,
    editChanged,
    editDraft,
    editIsStale,
    saveArtifactEdit,
    storedArtifact,
  ]);

  const canToggleTasks = canEditSource && editDraft === null;

  const canAskForChanges =
    Boolean(conversationId) &&
    artifact !== null &&
    !hasGeneratedFileManifest &&
    editDraft === null &&
    shownVersionIndex === Math.max(0, versionCount - 1) &&
    activeContent.trim().length > 0;

  const handleAskForChanges = useCallback(() => {
    if (!conversationId || !artifact) return;
    const replyType = inlineViewerKind(artifact) === 'deck' ? 'presentation' : artifact.type;
    prefillComposer(conversationId, artifactChangeRequestPrefill(artifact.title, replyType));
    onClose();
  }, [artifact, conversationId, onClose]);

  const canReviewChanges =
    canShowChanges &&
    canEditSource &&
    editDraft === null &&
    artifact !== null &&
    artifact.type !== 'chart' &&
    !isMonospaceArtifact(artifact);
  if (reviewingFor !== null && (reviewingFor !== changesKey || !canReviewChanges)) {
    setReviewingFor(null);
  }
  const reviewingChanges = canReviewChanges && reviewingFor === changesKey;

  const handleApplyReview = useCallback(
    (text: string) => {
      if (!storedArtifact) return;
      setReviewingFor(null);
      if (text !== activeContent && text.trim().length > 0) {
        saveArtifactEdit({ ...storedArtifact, content: text });
        preferredNotificationHaptic(Haptics.NotificationFeedbackType.Success);
        Alert.alert(REVIEW_SAVED_MESSAGE);
      }
    },
    [activeContent, saveArtifactEdit, storedArtifact],
  );

  const libraryCandidate = libraryArtifact ?? storedArtifact;
  const [libraryReceipts, setLibraryReceipts] = useState<Record<string, LibrarySaveReceipt>>({});
  const libraryReceipt = artifactId ? libraryReceipts[artifactId] : undefined;
  const canSaveToLibrary =
    libraryCandidate !== undefined &&
    canSaveArtifactToLibrary(libraryCandidate) &&
    !hasGeneratedFileManifest &&
    activeContent.trim().length > 0 &&
    libraryReceipt?.content !== activeContent;

  const handleSaveToLibrary = useCallback(async () => {
    if (!libraryCandidate || !artifactId) return;
    const content = activeContent;
    const title = libraryCandidate.title;
    const account = captureCloudAccountEpoch();
    const stillSameAccount = () => account === null || isCloudAccountEpochCurrent(account);
    setLibraryReceipts((receipts) => ({
      ...receipts,
      [artifactId]: { content, status: 'saving' },
    }));
    try {
      await saveArtifactToLibrary({ ...libraryCandidate, content });
      setLibraryReceipts((receipts) =>
        receipts[artifactId]?.content === content
          ? { ...receipts, [artifactId]: { content, status: 'saved' } }
          : receipts,
      );
      if (stillSameAccount()) Alert.alert('Saved to Library', `“${title}” is in your Library.`);
    } catch {
      setLibraryReceipts((receipts) => {
        if (receipts[artifactId]?.content !== content) return receipts;
        const { [artifactId]: _failed, ...rest } = receipts;
        return rest;
      });
      if (stillSameAccount()) {
        Alert.alert('Could not save to Library', `“${title}” was not saved. Try again.`);
      }
    }
  }, [activeContent, artifactId, libraryCandidate]);

  const handleTaskToggle = useCallback(
    (taskIndex: number) => {
      if (!storedArtifact) return;
      const next = toggleMarkdownTask(activeContent, taskIndex);
      if (next === activeContent) return;
      saveArtifactEdit({ ...storedArtifact, content: next });
    },
    [activeContent, saveArtifactEdit, storedArtifact],
  );

  const outlineSections = useMemo(
    () =>
      artifact && !isMonospaceArtifact(artifact) && artifact.type !== 'chart'
        ? extractReportSections(activeContent)
        : [],
    [activeContent, artifact],
  );
  const hasOutline = outlineSections.length >= OUTLINE_MIN_HEADINGS;
  const [outlineOpenFor, setOutlineOpenFor] = useState<string | null>(null);
  const outlineOpen = outlineOpenFor !== null && outlineOpenFor === artifactId;
  const documentScrollRef = useRef<ScrollView>(null);
  const documentTop = useRef(0);
  const headingTops = useRef(new Map<string, number>());
  const handleDocumentLayout = useCallback((event: LayoutChangeEvent) => {
    documentTop.current = event.nativeEvent.layout.y;
  }, []);
  const handleHeadingLayout = useCallback((sectionId: string, y: number) => {
    headingTops.current.set(sectionId, y);
  }, []);
  const jumpToHeading = useCallback((sectionId: string) => {
    const top = headingTops.current.get(sectionId);
    if (top === undefined) return;
    documentScrollRef.current?.scrollTo({
      y: Math.max(0, documentTop.current + top - spacing.sm),
      animated: true,
    });
  }, []);

  const markdownOptions = useMemo(
    () => ({
      citations: researchSources,
      ...(canToggleTasks ? { onTaskToggle: handleTaskToggle } : {}),
      ...(hasOutline ? { onHeadingLayout: handleHeadingLayout } : {}),
    }),
    [canToggleTasks, handleHeadingLayout, handleTaskToggle, hasOutline, researchSources],
  );

  const renderSlideMarkdown = useCallback(
    (text: string) => renderMarkdownContent(text, colors, { citations: researchSources }),
    [colors, researchSources],
  );

  const handleViewerAsk = useCallback(
    (prompt: string) => {
      if (!conversationId) return;
      prefillComposer(conversationId, prompt);
      onClose();
    },
    [conversationId, onClose],
  );

  const handleDeckSave = useCallback(
    (text: string) => {
      if (!storedArtifact || text === activeContent || text.trim().length === 0) return;
      saveArtifactEdit({ ...storedArtifact, content: text });
    },
    [activeContent, saveArtifactEdit, storedArtifact],
  );

  const handleDrawn = useCallback(
    (svg: string | null) => setDrawing(svg ? { source: activeContent, svg } : null),
    [activeContent],
  );

  const handleCopyLink = useCallback(() => {
    if (!publishedUrl) return;
    void copyLink(publishedUrl);
  }, [publishedUrl, copyLink]);

  const handleShareLink = useCallback(async () => {
    if (!publishedUrl || !artifact) return;
    await Share.share({ title: artifact.title, message: publishedUrl });
  }, [publishedUrl, artifact]);

  const handleOpenPublished = useCallback(() => {
    if (!publishedUrl) return;
    void openExternalUrl(publishedUrl).then((opened) => {
      if (!opened) Alert.alert('Could not open the link', 'Copy the link and open it in Safari.');
    });
  }, [publishedUrl]);

  const dismissForNavigation = useCallback(() => {
    if (!editChanged) {
      onClose();
      return;
    }
    confirmDiscardEdits(artifact?.title ?? '', () => {
      closeEditor();
      onClose();
    });
  }, [artifact?.title, closeEditor, editChanged, onClose]);
  useDismissOnScreenBlur(visible, dismissForNavigation);

  const dismiss = { onPress: onClose, label: 'Close', hint: 'Returns to the conversation' };
  const chrome = useFullScreenChrome({
    surface: 'chat.artifact.fullscreen',
    back: dismiss,
    close: dismiss,
  });

  if (!artifact) return null;

  const canPreview = isPreviewable(artifact);
  const previewKind = livePreviewKind(artifact);
  const isMonospace = isMonospaceArtifact(artifact);
  const currentArtifact = artifact;
  const showsLivePreview =
    canPreview &&
    viewMode === 'preview' &&
    previewKind !== null &&
    !showChanges &&
    !reviewingChanges;
  const sourceTextStyle = {
    fontSize: typeScale.footnote,
    lineHeight: SOURCE_LINE_HEIGHT,
    color: colors.textPrimary,
    fontFamily: SOURCE_FONT_FAMILY,
  };
  const renderSourceTokens = (tokens: readonly SyntaxToken[], keyPrefix: string) =>
    tokens.map((token, tokenIdx) =>
      token.type === 'plain' ? (
        token.text
      ) : (
        <Text
          key={`${keyPrefix}-${tokenIdx}`}
          style={{ color: syntaxTokenColor(token.type, colors) }}
        >
          {token.text}
        </Text>
      ),
    );

  const openMoreActions = () => {
    moreMenu.open(currentArtifact.title, [
      ...(showsLivePreview
        ? [
            {
              key: 'refresh-preview',
              label: 'Refresh preview',
              run: () => setPreviewRun((run) => run + 1),
            },
          ]
        : []),
      ...(canAskForChanges
        ? [{ key: 'ask-for-changes', label: ASK_FOR_CHANGES_LABEL, run: handleAskForChanges }]
        : []),
      ...(canEditSource
        ? [{ key: 'edit-source', label: 'Edit source', run: handleStartEdit }]
        : []),
      ...(canReviewChanges && !reviewingChanges
        ? [
            {
              key: 'review-changes',
              label: REVIEW_CHANGES_LABEL,
              run: () => {
                setChangesShownFor(null);
                setReviewingFor(changesKey);
              },
            },
          ]
        : []),
      ...(canUndoEdit ? [{ key: 'undo', label: UNDO_EDIT_LABEL, run: handleUndoEdit }] : []),
      ...(canRedoEdit ? [{ key: 'redo', label: REDO_EDIT_LABEL, run: handleRedoEdit }] : []),
      ...(canSaveToLibrary
        ? [
            {
              key: 'save-to-library',
              label: 'Save to Library',
              run: () => void handleSaveToLibrary(),
            },
          ]
        : []),
      ...(onRegenerate
        ? [
            {
              key: 'regenerate',
              label: 'Regenerate',
              run: () => {
                onRegenerate();
                onClose();
              },
            },
          ]
        : []),
      {
        key: 'report',
        label: REPORT_THIS_ARTIFACT,
        run: () => setReportingId(currentArtifact.id),
      },
    ]);
  };

  const headerTitle =
    studyArtifactTitle(artifact.language, artifact.content) ??
    (studyArtifactContent(artifact.language, artifact.content) !== null
      ? artifactDisplayTitle({
          type: artifact.type,
          content: artifact.content,
          language: artifact.language,
        })
      : artifact.title);
  const titleLabel = `${headerTitle} · ${typeLabel(artifact)}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={chrome.onRequestClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <ChatScrollIntoViewReset>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 12,
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.surfaceBase,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: typeScale.body,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  paddingLeft: spacing.xs,
                }}
                numberOfLines={1}
                accessibilityLabel={titleLabel}
              >
                {titleLabel}
              </Text>

              {canPublish(artifact, activeContent) ? (
                <PressableBox
                  onPress={handlePublish}
                  style={{ ...ICON_TARGET, opacity: publishing ? 0.5 : 1 }}
                  accessibilityLabel={
                    publishedUrl ? 'Republish artifact link' : 'Publish artifact to a public link'
                  }
                  accessibilityRole="button"
                  disabled={publishing}
                >
                  <Globe
                    size={HEADER_ICON_SIZE}
                    color={publishedUrl ? colors.agentSuccess : colors.textSecondary}
                  />
                </PressableBox>
              ) : null}

              <PressableBox
                onPress={handleDownload}
                style={{ ...ICON_TARGET, opacity: downloading ? 0.5 : 1 }}
                accessibilityLabel="Download artifact"
                accessibilityRole="button"
                disabled={downloading}
              >
                <Download size={HEADER_ICON_SIZE} color={colors.textSecondary} />
              </PressableBox>

              {hasGeneratedFileManifest ? (
                <PressableBox
                  onPress={handleShare}
                  style={ICON_TARGET}
                  accessibilityLabel="Share generated file"
                  accessibilityRole="button"
                >
                  <Share2 size={HEADER_ICON_SIZE} color={colors.textSecondary} />
                </PressableBox>
              ) : null}

              {/* Copy only when there is actual source text. Generated-file
                descriptors intentionally carry empty content because their
                bytes live behind the authenticated file route; a Copy button
                there used to succeed while placing an empty string on the
                clipboard. */}
              {activeContent.trim().length > 0 ? (
                <PressableBox
                  onPress={handleCopy}
                  style={ICON_TARGET}
                  accessibilityLabel={copyControlLabel(copyStatus, 'Copy content')}
                  accessibilityRole="button"
                >
                  {copyStatus === 'copied' ? (
                    <Check size={HEADER_ICON_SIZE} color={colors.agentSuccess} />
                  ) : copyStatus === 'failed' ? (
                    <TriangleAlert size={HEADER_ICON_SIZE} color={colors.agentError} />
                  ) : (
                    <Copy size={HEADER_ICON_SIZE} color={colors.textSecondary} />
                  )}
                </PressableBox>
              ) : null}

              <PressableBox
                testID="artifact-fullscreen-more"
                onPress={openMoreActions}
                style={ICON_TARGET}
                accessibilityLabel="More artifact actions"
                accessibilityHint={moreActionsHint(canEditSource, Boolean(onRegenerate))}
                accessibilityRole="button"
              >
                <MoreHorizontal size={HEADER_ICON_SIZE} color={colors.textSecondary} />
              </PressableBox>

              <PressableBox
                {...chrome.close}
                style={{ ...chrome.close.style, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={HEADER_ICON_SIZE} color={colors.textSecondary} />
              </PressableBox>
            </View>

            {canPreview ? (
              <View
                accessibilityRole="tablist"
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
              >
                {(['preview', 'source'] as const).map((mode) => {
                  const selected = viewMode === mode;
                  const label = mode === 'preview' ? 'Preview' : 'Source';
                  return (
                    <PressableBox
                      key={mode}
                      onPress={() => setViewMode(mode)}
                      style={{
                        minHeight: FULL_SCREEN_TOUCH_TARGET,
                        paddingHorizontal: spacing.sm,
                        justifyContent: 'center',
                      }}
                      accessibilityLabel={label}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={{
                          fontSize: typeScale.subhead,
                          fontWeight: selected ? '600' : '400',
                          color: selected ? colors.textPrimary : colors.textMuted,
                        }}
                      >
                        {label}
                      </Text>
                    </PressableBox>
                  );
                })}
              </View>
            ) : null}

            {versionCount > 1 ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 2,
                }}
                testID="artifact-version-chip"
              >
                <PressableBox
                  onPress={() => setViewedVersionIndex(Math.max(0, shownVersionIndex - 1))}
                  disabled={shownVersionIndex <= 0}
                  style={{ ...ICON_TARGET, opacity: shownVersionIndex <= 0 ? 0.3 : 1 }}
                  accessibilityLabel="Previous version"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: shownVersionIndex <= 0 }}
                >
                  <ChevronLeft size={15} color={colors.textSecondary} />
                </PressableBox>
                <PressableBox
                  onPress={() => setVersionHistoryOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Version ${shownVersionIndex + 1} of ${versionCount}`}
                  accessibilityHint="Opens the version history"
                  testID="artifact-version-history-button"
                  style={TEXT_TARGET}
                >
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      color: colors.textSecondary,
                      minWidth: 42,
                      textAlign: 'center',
                      textDecorationLine: 'underline',
                    }}
                    accessibilityLiveRegion="polite"
                    testID="artifact-version-label"
                  >
                    {`v${shownVersionIndex + 1}/${versionCount}`}
                  </Text>
                </PressableBox>
                <PressableBox
                  onPress={() =>
                    setViewedVersionIndex(Math.min(versionCount - 1, shownVersionIndex + 1))
                  }
                  disabled={shownVersionIndex >= versionCount - 1}
                  style={{
                    ...ICON_TARGET,
                    opacity: shownVersionIndex >= versionCount - 1 ? 0.3 : 1,
                  }}
                  accessibilityLabel="Next version"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: shownVersionIndex >= versionCount - 1 }}
                >
                  <ChevronRight size={15} color={colors.textSecondary} />
                </PressableBox>
                {canShowChanges ? (
                  <PressableBox
                    onPress={() => {
                      setReviewingFor(null);
                      setChangesShownFor(showChanges ? null : changesKey);
                    }}
                    style={TEXT_TARGET}
                    accessibilityLabel="Show changes"
                    accessibilityRole="button"
                    accessibilityState={{ selected: showChanges }}
                    testID="artifact-show-changes"
                  >
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: showChanges ? '600' : '500',
                        color: showChanges ? colors.textPrimary : colors.textSecondary,
                      }}
                    >
                      Show changes
                    </Text>
                  </PressableBox>
                ) : null}
                {shownVersionIndex < versionCount - 1 ? (
                  <PressableBox
                    onPress={handleRestoreVersion}
                    style={TEXT_TARGET}
                    accessibilityLabel={`Restore version ${shownVersionIndex + 1}`}
                    accessibilityRole="button"
                    testID="artifact-restore-version"
                  >
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: '500',
                        color: colors.textSecondary,
                      }}
                    >
                      Restore
                    </Text>
                  </PressableBox>
                ) : null}
              </View>
            ) : null}
            {artifact && onSwitch && switchable && switchable.length > 1 ? (
              <ArtifactSwitcher artifacts={switchable} activeId={artifact.id} onSelect={onSwitch} />
            ) : null}

            {uncertainPublishView === publicationView && isPublicationViewCurrent() ? (
              <View>
                <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>
                  A publish is unconfirmed. Any link shown is the last known publication and may
                  contain an earlier version. No automatic retry was made.
                </Text>
                {artifact && publicationView.account !== null ? (
                  <PressableBox
                    accessibilityRole="button"
                    accessibilityLabel="Check publication status"
                    accessibilityState={{ disabled: checkingPublication || publishing }}
                    disabled={checkingPublication || publishing}
                    onPress={() => {
                      if (publicationMutation.current?.view !== publicationView) {
                        void loadPublication(artifact.id, 'uncertain-publish');
                      }
                    }}
                    style={{ minHeight: FULL_SCREEN_TOUCH_TARGET, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {checkingPublication ? 'Checking publication…' : 'Check publication status'}
                    </Text>
                  </PressableBox>
                ) : null}
              </View>
            ) : null}
            {artifact &&
            appMode === 'cloud' &&
            publicationKnown &&
            !publishedUrl &&
            uncertainPublishView !== publicationView ? (
              <Text
                style={{ marginTop: 10, fontSize: typeScale.caption, color: colors.textSecondary }}
                testID="artifact-private-state"
              >
                Private. Only you can open it until you publish it.
              </Text>
            ) : null}
            {publishedUrl ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingLeft: 10,
                  borderRadius: 8,
                  backgroundColor: colors.accentSurface,
                }}
              >
                <Text
                  style={{ flex: 1, fontSize: typeScale.caption, color: colors.textSecondary }}
                  numberOfLines={1}
                  selectable
                  testID="artifact-published-url"
                >
                  {publishedUrl}
                </Text>
                <PressableBox
                  onPress={handleCopyLink}
                  accessibilityLabel={copyControlLabel(linkCopyStatus, 'Copy publication link')}
                  accessibilityRole="button"
                  style={ICON_TARGET}
                >
                  {linkCopyStatus === 'copied' ? (
                    <Check size={15} color={colors.agentSuccess} />
                  ) : linkCopyStatus === 'failed' ? (
                    <TriangleAlert size={15} color={colors.agentError} />
                  ) : (
                    <Copy size={15} color={colors.textSecondary} />
                  )}
                </PressableBox>
                <PressableBox
                  onPress={handleShareLink}
                  accessibilityLabel="Share publication link"
                  accessibilityRole="button"
                  style={ICON_TARGET}
                >
                  <Share2 size={15} color={colors.textSecondary} />
                </PressableBox>
                {isAllowedExternalUrl(publishedUrl) ? (
                  <PressableBox
                    onPress={handleOpenPublished}
                    accessibilityLabel="Open in Safari"
                    accessibilityRole="button"
                    style={ICON_TARGET}
                    testID="artifact-open-published"
                  >
                    <ExternalLink size={15} color={colors.textSecondary} />
                  </PressableBox>
                ) : null}
              </View>
            ) : null}
            {currentPublication && artifact ? (
              <PublishedArtifactControls
                title={artifact.title}
                publication={currentPublication}
                workspaceMemberCount={workspaceMemberCount}
                onMutationStart={beginPublicationMutation}
                isMutationCurrent={isPublicationMutationCurrent}
                onMutationEnd={endPublicationMutation}
                onChanged={(publication, mutation) => {
                  if (mutation === undefined || !isPublicationMutationCurrent(mutation)) return;
                  invalidatePublicationLookup();
                  setPublished({ view: publicationView, publication });
                  recordPublishedArtifactAudience(artifact.id, publication.visibility);
                }}
                onUnpublished={(mutation) => {
                  if (mutation === undefined || !isPublicationMutationCurrent(mutation)) return;
                  invalidatePublicationLookup();
                  setPublished(null);
                  recordPublishedArtifactAudience(artifact.id, null);
                  void loadPublication(artifact.id, 'post-unpublish');
                }}
              />
            ) : null}
          </View>

          {reviewingChanges && previousVersionContent !== undefined ? (
            <ArtifactChangesReview
              previous={previousVersionContent}
              next={activeContent}
              fromVersion={shownVersionIndex}
              toVersion={shownVersionIndex + 1}
              bottomInset={insets.bottom}
              onApply={handleApplyReview}
              onClose={() => setReviewingFor(null)}
            />
          ) : showChanges && previousVersionContent !== undefined ? (
            <ArtifactChangesView
              previous={previousVersionContent}
              next={activeContent}
              unit={isMonospace ? 'line' : 'word'}
              fromVersion={shownVersionIndex}
              bottomInset={insets.bottom}
            />
          ) : viewerSource?.origin === 'file' && viewerKind !== null ? (
            <View
              style={{ flex: 1, paddingBottom: insets.bottom }}
              testID="artifact-fullscreen-file-viewer"
            >
              <ArtifactViewer source={viewerSource} />
            </View>
          ) : canPreview && viewMode === 'preview' && viewerSource && viewerKind === 'table' ? (
            <View
              style={{ flex: 1, paddingBottom: insets.bottom }}
              testID="artifact-fullscreen-table"
            >
              <ArtifactViewer source={viewerSource} />
            </View>
          ) : canPreview && viewMode === 'preview' && viewerSource && viewerKind === 'deck' ? (
            <View
              style={{ flex: 1, paddingBottom: insets.bottom }}
              testID="artifact-fullscreen-deck"
            >
              <ArtifactViewer
                source={viewerSource}
                renderMarkdown={renderSlideMarkdown}
                {...(canAskForChanges ? { onAsk: handleViewerAsk } : {})}
                {...(canEditSource && editDraft === null ? { onSave: handleDeckSave } : {})}
                handEdited={versionCount > 1}
              />
            </View>
          ) : canPreview && viewMode === 'preview' && viewerSource && viewerKind === 'study' ? (
            <View
              style={{ flex: 1, paddingBottom: insets.bottom }}
              testID="artifact-fullscreen-study"
            >
              <ArtifactViewer
                source={viewerSource}
                renderMarkdown={renderSlideMarkdown}
                {...(conversationId ? { onAsk: handleViewerAsk } : {})}
              />
            </View>
          ) : canPreview && viewMode === 'preview' && previewKind === 'mermaid' ? (
            <MermaidDiagramView
              key={`${artifact.id}-${previewRun}`}
              source={activeContent}
              style={{ flex: 1 }}
              onViewSource={() => setViewMode('source')}
              onDrawn={handleDrawn}
            />
          ) : canPreview && viewMode === 'preview' && previewKind ? (
            <SafeArtifactPreview
              key={`${artifact.id}-${previewRun}`}
              content={activeContent}
              kind={previewKind}
              style={{ flex: 1 }}
              onViewSource={() => setViewMode('source')}
            />
          ) : canPreview && viewMode === 'preview' ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                gap: 12,
              }}
            >
              <Eye size={32} color={colors.textMuted} />
              <Text
                style={{
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  textAlign: 'center',
                }}
              >
                Live preview isn’t available for this type
              </Text>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: colors.textMuted,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Switch to Source view to read it.
              </Text>
              <PressableBox
                onPress={() => setViewMode('source')}
                style={{
                  marginTop: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel="Switch to source view"
                accessibilityRole="button"
              >
                <Text
                  style={{
                    fontSize: typeScale.subhead,
                    fontWeight: '500',
                    color: colors.textSecondary,
                  }}
                >
                  View Source
                </Text>
              </PressableBox>
            </View>
          ) : (
            <ScrollView
              ref={documentScrollRef}
              testID="artifact-fullscreen-document"
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{
                ...contentColumn('reading'),
                padding: 16,
                paddingBottom: insets.bottom + 24,
              }}
              showsVerticalScrollIndicator
              horizontal={false}
            >
              {hasGeneratedFileManifest ? (
                <View style={{ marginBottom: 16 }}>
                  <GeneratedFileCard presentation={generatedFileSummary} />
                </View>
              ) : null}

              {artifact.type === 'email' && artifact.metadata != null && (
                <View
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: colors.accentSurface,
                    gap: 4,
                  }}
                >
                  {artifact.metadata.from != null && (
                    <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: '600', color: colors.textPrimary }}>
                        {'From: '}
                      </Text>
                      {String(artifact.metadata.from)}
                    </Text>
                  )}
                  {artifact.metadata.to != null && (
                    <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'To: '}</Text>
                      {String(artifact.metadata.to)}
                    </Text>
                  )}
                  {artifact.metadata.subject != null && (
                    <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: '600', color: colors.textPrimary }}>
                        {'Subject: '}
                      </Text>
                      {String(artifact.metadata.subject)}
                    </Text>
                  )}
                </View>
              )}

              {isMonospace && artifact.language ? (
                <Text
                  style={{
                    marginBottom: spacing.xs,
                    fontSize: typeScale.caption,
                    color: colors.textMuted,
                  }}
                >
                  {artifact.language}
                </Text>
              ) : null}

              {isMonospace ? (
                <CodeLinesScroller
                  testID="artifact-fullscreen-source"
                  showsIndicator
                  style={{
                    backgroundColor: colors.surfaceBase,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  contentContainerStyle={{ padding: 12 }}
                >
                  {wrapLongLines ? (
                    <View>
                      {sourceLines.map((line, lineIndex) => (
                        <View
                          key={`src-line-${lineIndex}`}
                          style={{ flexDirection: 'row', minHeight: SOURCE_LINE_HEIGHT }}
                        >
                          <SourceLineNumbers labels={[sourceLineNumbers[lineIndex] ?? '']} />
                          <Text style={[sourceTextStyle, { flex: 1 }]} selectable>
                            {renderSourceTokens(line, `src-line-${lineIndex}`)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row' }}>
                      <SourceLineNumbers labels={sourceLineNumbers} />
                      <Text style={sourceTextStyle} selectable>
                        {renderSourceTokens(sourceTokens, 'src-tok')}
                      </Text>
                    </View>
                  )}
                </CodeLinesScroller>
              ) : artifact.type === 'chart' ? (
                <View testID="artifact-fullscreen-chart">
                  <ChartArtifactView content={activeContent} colors={colors} />
                </View>
              ) : (
                <>
                  {hasOutline ? (
                    <ArtifactDocumentOutline
                      sections={outlineSections}
                      open={outlineOpen}
                      onToggle={() => setOutlineOpenFor(outlineOpen ? null : (artifactId ?? null))}
                      onSelect={jumpToHeading}
                    />
                  ) : null}
                  <View
                    key={artifact.id}
                    testID="artifact-fullscreen-markdown"
                    {...(hasOutline ? { onLayout: handleDocumentLayout } : {})}
                  >
                    {renderMarkdownContent(activeContent, colors, markdownOptions)}
                  </View>
                </>
              )}

              {researchSources.length > 0 ? (
                <View style={{ marginTop: spacing.lg }}>
                  <ResearchSourcesAppendix sources={researchSources} />
                </View>
              ) : artifact.type === 'research' &&
                typeof artifact.metadata?.citations === 'string' ? (
                <Text
                  style={{
                    marginTop: spacing.lg,
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                    lineHeight: 20,
                  }}
                >
                  {artifact.metadata.citations}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </View>
        <ArtifactVersionHistorySheet
          visible={versionHistoryOpen && versionCount > 1}
          versions={versionHistory ?? []}
          shownIndex={shownVersionIndex}
          onOpen={handleOpenHistoryVersion}
          onRestore={handleRestoreHistoryVersion}
          onClose={() => setVersionHistoryOpen(false)}
        />
        <Modal visible={editDraft !== null} animationType="slide" onRequestClose={handleCancelEdit}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardAvoidingBehavior('modal')}>
            <View
              style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingBottom: 8,
                  gap: 8,
                }}
              >
                <PressableBox
                  onPress={handleCancelEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                  style={{
                    minHeight: FULL_SCREEN_TOUCH_TARGET,
                    justifyContent: 'center',
                    padding: 8,
                  }}
                >
                  <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
                    Cancel
                  </Text>
                </PressableBox>
                <Text
                  style={{
                    flex: 1,
                    fontSize: typeScale.body,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                  numberOfLines={1}
                >
                  {headerTitle}
                </Text>
                <PressableBox
                  onPress={handleSaveEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Save as a new version"
                  style={{
                    minHeight: FULL_SCREEN_TOUCH_TARGET,
                    justifyContent: 'center',
                    padding: 8,
                  }}
                >
                  <Text style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.teal }}>
                    Save
                  </Text>
                </PressableBox>
              </View>
              {editRestored ? (
                <Text
                  testID="artifact-edit-restored"
                  style={{
                    marginHorizontal: 12,
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                  }}
                >
                  Restored your unsaved edits to this artifact.
                </Text>
              ) : null}
              {editIsStale ? (
                <Text
                  accessibilityRole="alert"
                  testID="artifact-edit-stale"
                  style={{
                    marginHorizontal: 12,
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                  }}
                >
                  A newer version arrived while you were editing.
                </Text>
              ) : null}
              <TextInput
                value={editDraft ?? ''}
                onChangeText={handleEditChange}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
                accessibilityLabel="Artifact source"
                style={{
                  flex: 1,
                  margin: 12,
                  padding: 12,
                  fontSize: typeScale.footnote,
                  lineHeight: 20,
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  fontFamily: codeFontFamily,
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <ArtifactExportSheet
          artifact={artifact}
          content={activeContent}
          visible={exportOpen}
          onClose={() => setExportOpen(false)}
        />
        <ActionMenuSheet menu={moreMenu.menu} dismissLabel="Dismiss artifact actions" />
        {visible && reportingId === artifact.id ? (
          <ReportSheet
            visible
            onClose={() => setReportingId(null)}
            title={REPORT_THIS_ARTIFACT}
            target={artifactReportTarget(artifact, activeContent, messageId, conversationId)}
          />
        ) : null}
      </ChatScrollIntoViewReset>
    </Modal>
  );
}
