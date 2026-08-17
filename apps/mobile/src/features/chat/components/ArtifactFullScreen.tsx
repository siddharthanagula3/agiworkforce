import { View, ScrollView, Pressable, Modal, Share, Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Copy, Check, Share2, RefreshCw, Eye, Code, Download, Globe } from 'lucide-react-native';
import { useState, useCallback, useMemo } from 'react';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { copyToClipboard } from '@/lib/clipboard';
import { api } from '@/services/api';
import {
  shareFile,
  exportToText,
  exportToMarkdown,
  downloadGeneratedFile,
} from '@/services/fileCreation';
import { tokenizeCode, syntaxTokenColor } from '@/src/features/chat/utils/syntaxHighlight';
import type { Artifact } from '@/types/chat';
import { renderMarkdownContent } from './MessageContentRenderer';
import { GeneratedFileCard } from './GeneratedFileCard';
import { SafeArtifactPreview, type PreviewableKind } from './SafeArtifactPreview';

interface ArtifactFullScreenProps {
  artifact: Artifact | null;
  visible: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
}

/**
 * Languages/types for which a preview pane is offered.
 *
 * SECURITY: `html`/`svg` render LIVE through {@link SafeArtifactPreview}, a
 * hardened WebView (JS disabled, strict CSP `default-src 'none'`, no RN bridge,
 * navigation blocked) — safe for untrusted artifact markup. `mermaid`/`jsx`/`tsx`
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

function canPublish(artifact: Artifact): boolean {
  return publishableKindFor(artifact) !== null && artifact.content.trim().length > 0;
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
  visible,
  onClose,
  onRegenerate,
}: ArtifactFullScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('source');
  const [downloading, setDownloading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ artifactId: string; url: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const publishedUrl = published && published.artifactId === artifact?.id ? published.url : null;

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

  const sourceTokens = useMemo(
    () =>
      artifact && isMonospaceArtifact(artifact)
        ? tokenizeCode(artifact.content, artifact.language)
        : [],
    [artifact],
  );

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    const success = await copyToClipboard(artifact.content);
    if (success) {
      setCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [artifact]);

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
        const isMarkdownKind = artifact.type === 'document' || artifact.type === 'research';
        const result = isMarkdownKind
          ? await exportToMarkdown(artifact.content, artifact.title)
          : await exportToText(artifact.content, artifact.title);
        await shareFile(result.uri);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert(
        'Download failed',
        err instanceof Error ? err.message : 'Could not download this file.',
      );
    } finally {
      setDownloading(false);
    }
  }, [artifact, downloading]);

  const handlePublish = useCallback(async () => {
    if (!artifact || publishing) return;
    const kind = publishableKindFor(artifact);
    if (!kind) return;
    if (!(await confirmPublish(artifact.title))) return;

    setPublishing(true);
    try {
      const response = await api.post<{ shareUrl?: unknown }>('/api/artifacts/publish', {
        artifactId: artifact.id,
        title: artifact.title,
        kind,
        ...(artifact.language ? { language: artifact.language } : {}),
        content: artifact.content,
      });
      const shareUrl = typeof response.shareUrl === 'string' ? response.shareUrl.trim() : '';
      if (!shareUrl) throw new Error('The publish endpoint returned no share URL.');

      setPublished({ artifactId: artifact.id, url: shareUrl });
      setLinkCopied(await copyToClipboard(shareUrl));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert(
        'Publish failed',
        err instanceof Error ? err.message : 'Could not publish this artifact right now.',
      );
    } finally {
      setPublishing(false);
    }
  }, [artifact, publishing]);

  const handleCopyLink = useCallback(async () => {
    if (!publishedUrl) return;
    if (await copyToClipboard(publishedUrl)) {
      setLinkCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [publishedUrl]);

  const handleShareLink = useCallback(async () => {
    if (!publishedUrl || !artifact) return;
    await Share.share({ title: artifact.title, message: publishedUrl });
  }, [publishedUrl, artifact]);

  if (!artifact) return null;

  const canPreview = isPreviewable(artifact);
  const previewKind = livePreviewKind(artifact);
  const isMonospace = isMonospaceArtifact(artifact);

  const titleLabel = `${artifact.title} · ${typeLabel(artifact)}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
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
            {/* Preview / Source segmented toggle — only for previewable artifacts */}
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
                <Pressable
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
                </Pressable>
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <Pressable
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
                </Pressable>
              </View>
            ) : null}

            {/* Title · TYPE */}
            <Text
              style={{
                flex: 1,
                fontSize: 15,
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

            {/* Publish to a public link — only kinds the public renderer supports */}
            {canPublish(artifact) ? (
              <Pressable
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
              </Pressable>
            ) : null}

            {/* Download / export */}
            <Pressable
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
            </Pressable>

            {/* Share generated file (only when manifest present) */}
            {hasGeneratedFileManifest ? (
              <Pressable
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
              </Pressable>
            ) : null}

            {/* Refresh — re-generate the artifact (only when handler is wired) */}
            {onRegenerate ? (
              <Pressable
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
              </Pressable>
            ) : null}

            {/* Copy only when there is actual source text. Generated-file
                descriptors intentionally carry empty content because their
                bytes live behind the authenticated file route; a Copy button
                there used to succeed while placing an empty string on the
                clipboard. */}
            {artifact.content.trim().length > 0 ? (
              <Pressable
                onPress={handleCopy}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.neutralSurface,
                }}
                accessibilityLabel="Copy content"
                accessibilityRole="button"
              >
                {copied ? (
                  <Check size={17} color={colors.agentSuccess} />
                ) : (
                  <Copy size={17} color={colors.textSecondary} />
                )}
              </Pressable>
            ) : null}

            {/* Close */}
            <Pressable
              onPress={onClose}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: colors.neutralSurface,
              }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={17} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Row 2: the hosted link, once published */}
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
                style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}
                numberOfLines={1}
                selectable
                testID="artifact-published-url"
              >
                {publishedUrl}
              </Text>
              <Pressable
                onPress={handleCopyLink}
                accessibilityLabel="Copy public link"
                accessibilityRole="button"
                style={{ padding: 4 }}
              >
                {linkCopied ? (
                  <Check size={15} color={colors.agentSuccess} />
                ) : (
                  <Copy size={15} color={colors.textSecondary} />
                )}
              </Pressable>
              <Pressable
                onPress={handleShareLink}
                accessibilityLabel="Share public link"
                accessibilityRole="button"
                style={{ padding: 4 }}
              >
                <Share2 size={15} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ── Content ── */}
        {canPreview && viewMode === 'preview' && previewKind ? (
          <SafeArtifactPreview content={artifact.content} kind={previewKind} style={{ flex: 1 }} />
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
                fontSize: 16,
                fontWeight: '600',
                color: colors.textPrimary,
                textAlign: 'center',
              }}
            >
              Live preview isn’t available for this type
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              HTML, SVG, and Mermaid render live in a sandbox; JSX/TSX need compilation, which the
              secure preview intentionally omits. Switch to Source view to read the content.
            </Text>
            <Pressable
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
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>
                View Source
              </Text>
            </Pressable>
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
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'From: '}</Text>
                    {String(artifact.metadata.from)}
                  </Text>
                )}
                {artifact.metadata.to != null && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'To: '}</Text>
                    {String(artifact.metadata.to)}
                  </Text>
                )}
                {artifact.metadata.subject != null && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
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

            {/* Main content — horizontally scrollable monospace for code, formatted
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
                    fontSize: 13,
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
            ) : (
              <View testID="artifact-fullscreen-markdown">
                {renderMarkdownContent(artifact.content, colors)}
              </View>
            )}

            {/* Research citations */}
            {artifact.type === 'research' && artifact.metadata?.citations != null && (
              <View style={{ marginTop: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.textMuted,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Citations
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                  {String(artifact.metadata.citations)}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
