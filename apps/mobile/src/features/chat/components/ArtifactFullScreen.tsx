import {
  View,
  ScrollView,
  Modal,
  Share,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import * as Haptics from 'expo-haptics';
import {
  X,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Eye,
  Code,
  Download,
  Globe,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
  Pencil,
} from 'lucide-react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { useArtifactStore } from '@/src/features/artifacts/store';
import {
  fetchArtifactPublication,
  publishArtifact,
  publishFailureMessage,
  recordPublishedArtifactAudience,
  usePublishedArtifactAudiences,
  type ArtifactPublication,
} from '../services/artifactPublishing';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { shareFile, downloadGeneratedFile } from '@/services/fileCreation';
import { artifactExportOptions, exportArtifact } from '@/src/features/chat/utils/artifactExport';
import { ArtifactExportSheet } from './ArtifactExportSheet';
import { tokenizeCode, syntaxTokenColor } from '@/src/features/chat/utils/syntaxHighlight';
import { useFullScreenChrome } from '@/src/features/chat/chrome/fullScreenChrome';
import type { Artifact } from '@/types/chat';
import { ArtifactSwitcher } from './ArtifactSwitcher';
import { renderMarkdownContent } from './MessageContentRenderer';
import { ReportChart } from './ReportChart';
import { chartArtifactToChart } from '@/src/features/chat/utils/chartArtifact';
import { GeneratedFileCard } from './GeneratedFileCard';
import { SafeArtifactPreview, type PreviewableKind } from './SafeArtifactPreview';
import { ArtifactChangesView } from './ArtifactChangesView';
import { ArtifactVersionHistorySheet } from './ArtifactVersionHistorySheet';
import { PublishedArtifactControls } from './PublishedArtifactControls';

interface ArtifactFullScreenProps {
  artifact: Artifact | null;
  switchable?: Artifact[];
  onSwitch?: (artifact: Artifact) => void;
  visible: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
  conversationId?: string;
}

/**
 * Languages/types for which a preview pane is offered.
 *
 * SECURITY: `html`/`svg` render LIVE through {@link SafeArtifactPreview}, a
 * hardened WebView (JS disabled, strict CSP `default-src 'none'`, no RN bridge,
 * navigation blocked), safe for untrusted artifact markup. `mermaid`/`jsx`/`tsx`
 * need JavaScript or compilation to render and therefore CANNOT be shown in the
 * JS-disabled sandbox; they keep the preview toggle but display an honest
 * "source only" note rather than executing anything.
 */
const PREVIEWABLE_LANGUAGES = new Set(['html', 'svg', 'mermaid', 'jsx', 'tsx']);

function livePreviewKind(artifact: Artifact): PreviewableKind | null {
  const lang = artifact.language?.toLowerCase() ?? '';
  if (lang === 'html') return 'html';
  if (lang === 'svg') return 'svg';
  if (lang === 'mermaid') return 'mermaid';
  return null;
}

function isPreviewable(artifact: Artifact): boolean {
  const lang = artifact.language?.toLowerCase() ?? '';
  return PREVIEWABLE_LANGUAGES.has(lang);
}

/**
 * True when the source view should render syntax-highlighted monospace. Every
 * other type (document / research / email / chart) carries markdown prose and
 * is rendered through {@link renderMarkdownContent} instead.
 */
function isMonospaceArtifact(artifact: Artifact): boolean {
  return (
    artifact.type === 'code' || PREVIEWABLE_LANGUAGES.has(artifact.language?.toLowerCase() ?? '')
  );
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
  const lang = artifact.language?.toLowerCase() ?? '';
  if (lang === 'html') return 'html';
  if (lang === 'svg') return 'svg';
  if (lang === 'mermaid') return 'mermaid';
  if (lang === 'jsx' || lang === 'tsx') return 'react';
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
      `“${title}” will be uploaded to AGI Cloud and served at a URL anyone with the link can open. Do not publish anything you keep on-device only.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Publish', style: 'default', onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}

type ViewMode = 'source' | 'preview';

export function ArtifactFullScreen({
  artifact,
  switchable,
  onSwitch,
  visible,
  onClose,
  onRegenerate,
  conversationId,
}: ArtifactFullScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { status: copyStatus, copy } = useCopyAction();
  const [viewMode, setViewMode] = useState<ViewMode>('source');
  const [downloading, setDownloading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{
    artifactId: string;
    publication: ArtifactPublication;
  } | null>(null);
  const [workspaceMemberCount, setWorkspaceMemberCount] = useState<number | null>(null);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const { status: linkCopyStatus, copy: copyLink } = useCopyAction();
  const [viewedVersionIndex, setViewedVersionIndex] = useState<number | null>(null);
  const [changesShownFor, setChangesShownFor] = useState<string | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  const currentPublication =
    published && published.artifactId === artifact?.id ? published.publication : null;
  const publishedUrl = currentPublication?.shareUrl ?? null;
  const publicationKnown = usePublishedArtifactAudiences((s) => s.ownerId !== null);

  const artifactId = artifact?.id;

  const loadPublication = useCallback(async (id: string) => {
    try {
      const state = await fetchArtifactPublication(id);
      setWorkspaceMemberCount(state.workspaceMemberCount);
      setPublished((current) =>
        state.publication
          ? { artifactId: id, publication: state.publication }
          : current?.artifactId === id
            ? null
            : current,
      );
    } catch (error) {
      console.warn('[ArtifactFullScreen] publication lookup failed', error);
    }
  }, []);

  useEffect(() => {
    if (!visible || !artifactId || appMode !== 'cloud') return;
    void loadPublication(artifactId);
  }, [appMode, artifactId, loadPublication, visible]);
  const versionHistory = useArtifactStore((s) =>
    artifactId ? s.versionsById[artifactId] : undefined,
  );
  const restoreArtifactVersion = useArtifactStore((s) => s.restoreArtifactVersion);
  const storedArtifact = useArtifactStore((s) =>
    artifactId ? s.artifacts.find((candidate) => candidate.id === artifactId) : undefined,
  );
  const addArtifacts = useArtifactStore((s) => s.addArtifacts);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const versionCount = versionHistory?.length ?? 0;
  const shownVersionIndex = viewedVersionIndex ?? (versionCount > 0 ? versionCount - 1 : 0);
  const activeContent = versionHistory?.[shownVersionIndex]?.content ?? artifact?.content ?? '';

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
  const previousVersionContent =
    shownVersionIndex > 0 ? versionHistory?.[shownVersionIndex - 1]?.content : undefined;
  const changesKey = `${artifactId ?? ''}:${shownVersionIndex}:${versionCount}`;
  const canShowChanges = previousVersionContent !== undefined && !hasGeneratedFileManifest;
  if (changesShownFor !== null && (changesShownFor !== changesKey || !canShowChanges)) {
    setChangesShownFor(null);
  }
  const showChanges = canShowChanges && changesShownFor === changesKey;

  const sourceTokens = useMemo(
    () =>
      artifact && isMonospaceArtifact(artifact)
        ? tokenizeCode(activeContent, artifact.language)
        : [],
    [artifact, activeContent],
  );

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Share failed', 'This generated file is not available to share right now.');
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
        const [option, ...others] = artifactExportOptions(artifact);
        if (!option) return;
        if (others.length > 0) {
          setExportOpen(true);
          return;
        }
        await shareFile(await exportArtifact(activeContent, artifact.title, option));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Download failed', 'Could not download or share this file. Try again.');
    } finally {
      setDownloading(false);
    }
  }, [artifact, activeContent, downloading]);

  const handlePublish = useCallback(async () => {
    if (!artifact || publishing) return;
    const kind = publishableKindFor(artifact);
    if (!kind) return;
    if (!(await confirmPublish(artifact.title))) return;

    setPublishing(true);
    try {
      const shareUrl = await publishArtifact({
        artifactId: artifact.id,
        title: artifact.title,
        kind,
        ...(artifact.language ? { language: artifact.language } : {}),
        content: activeContent,
        ...(conversationId ? { conversationId } : {}),
      });

      setPublished((current) => ({
        artifactId: artifact.id,
        publication: {
          shareUrl,
          visibility:
            current?.artifactId === artifact.id ? current.publication.visibility : 'public',
        },
      }));
      await copyLink(shareUrl);
      void loadPublication(artifact.id);
    } catch (err) {
      Alert.alert('Publish failed', publishFailureMessage(err));
    } finally {
      setPublishing(false);
    }
  }, [artifact, activeContent, conversationId, copyLink, loadPublication, publishing]);

  const handleRestoreVersion = useCallback(() => {
    if (!artifactId) return;
    if (restoreArtifactVersion(artifactId, shownVersionIndex)) {
      setViewedVersionIndex(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [artifactId, restoreArtifactVersion],
  );

  const canEditSource =
    storedArtifact !== undefined &&
    !hasGeneratedFileManifest &&
    shownVersionIndex === Math.max(0, versionCount - 1) &&
    activeContent.trim().length > 0;

  const handleSaveEdit = useCallback(() => {
    if (!storedArtifact || editDraft === null) return;
    if (editDraft !== activeContent && editDraft.trim().length > 0) {
      addArtifacts([{ ...storedArtifact, content: editDraft }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEditDraft(null);
  }, [activeContent, addArtifacts, editDraft, storedArtifact]);

  const handleCopyLink = useCallback(() => {
    if (!publishedUrl) return;
    void copyLink(publishedUrl);
  }, [publishedUrl, copyLink]);

  const handleShareLink = useCallback(async () => {
    if (!publishedUrl || !artifact) return;
    await Share.share({ title: artifact.title, message: publishedUrl });
  }, [publishedUrl, artifact]);

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
  const chartArtifact = artifact.type === 'chart' ? chartArtifactToChart(activeContent) : null;

  const titleLabel = `${artifact.title} · ${typeLabel(artifact)}`;

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
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
        }}
      >
        {/* ── Header ── */}
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
          {/* Row 1: toggle (left) + title·type (flex) + action buttons (right) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Preview / Source segmented toggle, only for previewable artifacts */}
            {canPreview ? (
              <View
                style={{
                  flexDirection: 'row',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                <PressableBox
                  onPress={() => setViewMode('preview')}
                  style={{
                    padding: 6,
                    paddingHorizontal: 10,
                    backgroundColor:
                      viewMode === 'preview' ? colors.neutralSurface : colors.surfaceBase,
                  }}
                  accessibilityLabel="Preview"
                  accessibilityRole="button"
                  accessibilityState={{ selected: viewMode === 'preview' }}
                >
                  <Eye size={16} color={colors.textSecondary} />
                </PressableBox>
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <PressableBox
                  onPress={() => setViewMode('source')}
                  style={{
                    padding: 6,
                    paddingHorizontal: 10,
                    backgroundColor:
                      viewMode === 'source' ? colors.neutralSurface : colors.surfaceBase,
                  }}
                  accessibilityLabel="Source"
                  accessibilityRole="button"
                  accessibilityState={{ selected: viewMode === 'source' }}
                >
                  <Code size={16} color={colors.textSecondary} />
                </PressableBox>
              </View>
            ) : null}

            {/* Title · TYPE */}
            <Text
              style={{
                flex: 1,
                fontSize: typeScale.body,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
              numberOfLines={1}
              accessibilityLabel={titleLabel}
            >
              {titleLabel}
            </Text>

            {/* Privacy badge when manifest present */}
            {hasGeneratedFileManifest && generatedFileSummary.privacyShortLabel ? (
              <Badge label={generatedFileSummary.privacyShortLabel} color="gray" />
            ) : null}

            {/* Publish to a public link, only kinds the public renderer supports */}
            {canPublish(artifact, activeContent) ? (
              <PressableBox
                onPress={handlePublish}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                  opacity: publishing ? 0.5 : 1,
                }}
                accessibilityLabel={
                  publishedUrl ? 'Republish artifact link' : 'Publish artifact to a public link'
                }
                accessibilityRole="button"
                disabled={publishing}
              >
                <Globe
                  size={17}
                  color={publishedUrl ? colors.agentSuccess : colors.textSecondary}
                />
              </PressableBox>
            ) : null}

            {canEditSource ? (
              <PressableBox
                onPress={() => setEditDraft(activeContent)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel="Edit source"
                accessibilityHint="Saving keeps the current text as an earlier version"
                accessibilityRole="button"
              >
                <Pencil size={17} color={colors.textSecondary} />
              </PressableBox>
            ) : null}

            {/* Download / export */}
            <PressableBox
              onPress={handleDownload}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: colors.neutralSurface,
                opacity: downloading ? 0.5 : 1,
              }}
              accessibilityLabel="Download artifact"
              accessibilityRole="button"
              disabled={downloading}
            >
              <Download size={17} color={colors.textSecondary} />
            </PressableBox>

            {/* Share generated file (only when manifest present) */}
            {hasGeneratedFileManifest ? (
              <PressableBox
                onPress={handleShare}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel="Share generated file"
                accessibilityRole="button"
              >
                <Share2 size={17} color={colors.textSecondary} />
              </PressableBox>
            ) : null}

            {/* Refresh, re-generate the artifact (only when handler is wired) */}
            {onRegenerate ? (
              <PressableBox
                onPress={() => {
                  onRegenerate();
                  onClose();
                }}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel="Regenerate artifact"
                accessibilityRole="button"
              >
                <RefreshCw size={17} color={colors.textSecondary} />
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
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel={copyControlLabel(copyStatus, 'Copy content')}
                accessibilityRole="button"
              >
                {copyStatus === 'copied' ? (
                  <Check size={17} color={colors.agentSuccess} />
                ) : copyStatus === 'failed' ? (
                  <TriangleAlert size={17} color={colors.agentError} />
                ) : (
                  <Copy size={17} color={colors.textSecondary} />
                )}
              </PressableBox>
            ) : null}

            {/* Close */}
            <PressableBox
              {...chrome.close}
              style={{
                ...chrome.close.style,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: colors.neutralSurface,
              }}
            >
              <X size={17} color={colors.textSecondary} />
            </PressableBox>
          </View>

          {/* Row 2: version navigation over the store's real edit history */}
          {versionCount > 1 ? (
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 2,
                paddingVertical: 2,
                paddingHorizontal: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.neutralSurface,
              }}
              testID="artifact-version-chip"
            >
              <PressableBox
                onPress={() => setViewedVersionIndex(Math.max(0, shownVersionIndex - 1))}
                disabled={shownVersionIndex <= 0}
                style={{ padding: 6, opacity: shownVersionIndex <= 0 ? 0.3 : 1 }}
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
                style={{ paddingVertical: 6, paddingHorizontal: 2 }}
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
                  padding: 6,
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
                  onPress={() => setChangesShownFor(showChanges ? null : changesKey)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    backgroundColor: showChanges ? colors.accentSurface : colors.transparent,
                  }}
                  accessibilityLabel="Show changes"
                  accessibilityRole="button"
                  accessibilityState={{ selected: showChanges }}
                  testID="artifact-show-changes"
                >
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '500',
                      color: colors.textSecondary,
                    }}
                  >
                    Show changes
                  </Text>
                </PressableBox>
              ) : null}
              {shownVersionIndex < versionCount - 1 ? (
                <PressableBox
                  onPress={handleRestoreVersion}
                  style={{ paddingVertical: 6, paddingHorizontal: 8 }}
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

          {artifact && appMode === 'cloud' && publicationKnown && !publishedUrl ? (
            <Text
              style={{ marginTop: 10, fontSize: typeScale.caption, color: colors.textSecondary }}
              testID="artifact-private-state"
            >
              Private. Only you can open it until you publish it.
            </Text>
          ) : null}
          {/* Row 3: the hosted link, once published */}
          {publishedUrl ? (
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                paddingHorizontal: 10,
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
                accessibilityLabel={copyControlLabel(linkCopyStatus, 'Copy public link')}
                accessibilityRole="button"
                style={{ padding: 4 }}
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
                accessibilityLabel="Share public link"
                accessibilityRole="button"
                style={{ padding: 4 }}
              >
                <Share2 size={15} color={colors.textSecondary} />
              </PressableBox>
            </View>
          ) : null}
          {currentPublication && artifact ? (
            <PublishedArtifactControls
              title={artifact.title}
              publication={currentPublication}
              workspaceMemberCount={workspaceMemberCount}
              onChanged={(publication) => {
                setPublished({ artifactId: artifact.id, publication });
                recordPublishedArtifactAudience(artifact.id, publication.visibility);
              }}
              onUnpublished={() => {
                setPublished(null);
                recordPublishedArtifactAudience(artifact.id, null);
              }}
            />
          ) : null}
        </View>

        {/* ── Content ── */}
        {showChanges && previousVersionContent !== undefined ? (
          <ArtifactChangesView
            previous={previousVersionContent}
            next={activeContent}
            unit={isMonospace ? 'line' : 'word'}
            fromVersion={shownVersionIndex}
            bottomInset={insets.bottom}
          />
        ) : canPreview && viewMode === 'preview' && previewKind ? (
          <SafeArtifactPreview
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
              HTML, SVG, and Mermaid render live in a sandbox; JSX/TSX need compilation, which the
              secure preview intentionally omits. Switch to Source view to read the content.
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
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 24,
            }}
            showsVerticalScrollIndicator
            horizontal={false}
          >
            {/* Generated-file provenance header */}
            {hasGeneratedFileManifest ? (
              <View style={{ marginBottom: 16 }}>
                <GeneratedFileCard presentation={generatedFileSummary} />
              </View>
            ) : null}

            {/* Email metadata header */}
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
                    <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'From: '}</Text>
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

            {/* Language label for code/previewable content */}
            {isMonospace && artifact.language ? (
              <View style={{ marginBottom: 6 }}>
                <Badge label={artifact.language} color="teal" />
              </View>
            ) : null}

            {/* Main content, horizontally scrollable monospace for code, formatted
             * markdown for prose artifacts. Prose previously shared the monospace
             * path's single flat Text, which printed heading/list/emphasis markers
             * literally instead of rendering them. */}
            {isMonospace ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{
                  backgroundColor: colors.surfaceBase,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                contentContainerStyle={{ padding: 12 }}
              >
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    lineHeight: 20,
                    color: colors.textPrimary,
                    fontFamily: Platform.select({
                      ios: 'Menlo',
                      android: 'monospace',
                      default: 'monospace',
                    }),
                  }}
                  selectable
                >
                  {sourceTokens.map((token, tokenIdx) =>
                    token.type === 'plain' ? (
                      token.text
                    ) : (
                      <Text
                        key={`src-tok-${tokenIdx}`}
                        style={{ color: syntaxTokenColor(token.type, colors) }}
                      >
                        {token.text}
                      </Text>
                    ),
                  )}
                </Text>
              </ScrollView>
            ) : chartArtifact ? (
              <View testID="artifact-fullscreen-chart">
                <ReportChart chart={chartArtifact} colors={colors} />
              </View>
            ) : (
              <View testID="artifact-fullscreen-markdown">
                {renderMarkdownContent(activeContent, colors)}
              </View>
            )}

            {/* Research citations */}
            {artifact.type === 'research' && artifact.metadata?.citations != null && (
              <View style={{ marginTop: 16 }}>
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: colors.textMuted,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Citations
                </Text>
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                    lineHeight: 20,
                  }}
                >
                  {String(artifact.metadata.citations)}
                </Text>
              </View>
            )}
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
      <Modal
        visible={editDraft !== null}
        animationType="slide"
        onRequestClose={() => setEditDraft(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
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
                onPress={() => setEditDraft(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                style={{ padding: 8 }}
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
                {artifact.title}
              </Text>
              <PressableBox
                onPress={handleSaveEdit}
                accessibilityRole="button"
                accessibilityLabel="Save as a new version"
                style={{ padding: 8 }}
              >
                <Text style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.teal }}>
                  Save
                </Text>
              </PressableBox>
            </View>
            <TextInput
              value={editDraft ?? ''}
              onChangeText={setEditDraft}
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
                fontFamily: Platform.select({
                  ios: 'Menlo',
                  android: 'monospace',
                  default: 'monospace',
                }),
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
    </Modal>
  );
}
