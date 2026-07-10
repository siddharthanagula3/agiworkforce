import { View, ScrollView, Pressable, Modal, Share, Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Copy, Check, Share2, RefreshCw, Eye, Code, Download } from 'lucide-react-native';
import { useState, useCallback, useMemo } from 'react';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { copyToClipboard } from '@/lib/clipboard';
import {
  shareFile,
  exportToText,
  exportToMarkdown,
  downloadGeneratedFile,
} from '@/services/fileCreation';
import { tokenizeCode, syntaxTokenColor } from '@/src/features/chat/utils/syntaxHighlight';
import type { Artifact } from '@/types/chat';
import { GeneratedFileCard } from './GeneratedFileCard';

interface ArtifactFullScreenProps {
  artifact: Artifact | null;
  visible: boolean;
  onClose: () => void;
  /** When provided, shows a Refresh button that re-generates the artifact. */
  onRegenerate?: () => void;
}

/**
 * Languages/types for which a preview pane would be shown in a full HTML sandbox.
 *
 * SECURITY NOTE: Live preview is NOT implemented on mobile. The app does not
 * have a DOMPurify-equivalent sanitizer nor a properly sandboxed WebView
 * (MathBlock's WebView uses originWhitelist=['*'] and exposes the RN bridge,
 * which is unsafe for untrusted artifact HTML). Until a dedicated security
 * review produces a verified sandbox, previewable artifacts show a placeholder.
 * Tracked as follow-up: "Mobile live artifact preview — security review needed."
 */
const PREVIEWABLE_LANGUAGES = new Set(['html', 'svg', 'mermaid', 'jsx', 'tsx']);

/**
 * Returns true if this artifact type/language qualifies for the preview/source
 * toggle. For non-previewable artifacts we go straight to source view with no
 * toggle shown.
 */
function isPreviewable(artifact: Artifact): boolean {
  const lang = artifact.language?.toLowerCase() ?? '';
  if (PREVIEWABLE_LANGUAGES.has(lang)) return true;
  // pdf/docx by MIME when there's a generatedFile
  const mime = artifact.generatedFile?.mimeType?.toLowerCase() ?? '';
  if (mime === 'application/pdf' || mime.includes('officedocument')) return true;
  return false;
}

/** Derives the TYPE label shown next to the title (language takes priority). */
function typeLabel(artifact: Artifact): string {
  const raw = artifact.language ?? artifact.type;
  return raw.toUpperCase();
}

type ViewMode = 'source' | 'preview';

/**
 * Full-screen modal overlay for viewing expanded artifacts.
 *
 * Header (left→right):
 *   [Eye/Code toggle — only for previewable artifacts] | Title · TYPE | [Download] [Share?] [Refresh?] [Copy] [Close]
 *
 * Live preview is gated: because no sandboxed WebView pattern exists on mobile
 * today, the preview pane shows a placeholder. See SECURITY NOTE above.
 */
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
        fallbackStatus: artifact?.computeSession?.status,
      }),
    [artifact],
  );
  const hasGeneratedFileManifest = Boolean(
    artifact?.computeSession || artifact?.generatedFile || artifact?.artifactManifest,
  );

  // Tokenized source spans for the monospace view. Unknown languages and
  // oversize content come back as one plain token, matching the old render.
  const sourceTokens = useMemo(
    () => (artifact ? tokenizeCode(artifact.content, artifact.language) : []),
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
        // Cloud generated file: the remote /api/files URL is auth-gated, so a
        // shared LINK would 401 for the recipient. Download the real bytes
        // (Bearer-authed) and share the file itself.
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

  /**
   * Download / export: write content to a local file then open the native
   * share sheet so the user can save or send the file.
   *
   * Picks the format by artifact type:
   *   - document / research → markdown
   *   - code / html / svg / etc. → plain text (preserves syntax)
   *   - email / chart / image / fallback → plain text
   */
  const handleDownload = useCallback(async () => {
    if (!artifact || downloading) return;
    setDownloading(true);
    try {
      const remoteUri = artifact.generatedFile?.uri;
      if (artifact.generatedFile && remoteUri && /^https?:\/\//.test(remoteUri)) {
        // Cloud generated file (x_generated_files): the artifact's `content`
        // is empty — the real bytes live behind the authed /api/files route.
        // Download them (Bearer-authed) and hand the local file to the share
        // sheet so the user can save/open it.
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

  if (!artifact) return null;

  const canPreview = isPreviewable(artifact);
  const isCode = artifact.type === 'code';
  const isMonospace = isCode || PREVIEWABLE_LANGUAGES.has(artifact.language?.toLowerCase() ?? '');

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

            {/* Copy */}
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
        </View>

        {/* ── Content ── */}
        {canPreview && viewMode === 'preview' ? (
          /* Preview pane — placeholder until a verified sandbox is built.
           *
           * SECURITY: We do NOT render untrusted artifact HTML in a WebView here.
           * The existing MathBlock WebView is not a viable sandbox: it uses
           * originWhitelist=['*'] and exposes window.ReactNativeWebView (the RN
           * bridge). Rendering user-supplied HTML through it would allow arbitrary
           * code to call postMessage back into the RN host. A safe implementation
           * requires: sandboxIsolation, restricted originWhitelist (e.g. ['about:*']),
           * no RN bridge exposure, and a server-side or in-process HTML sanitizer
           * (no DOMPurify on mobile today). Flag: "Mobile live artifact preview —
           * needs dedicated security review before implementation." */
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
              Preview not available on mobile yet
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              Live rendering of HTML, SVG, and Mermaid artifacts requires a sandboxed environment.
              Switch to Source view to read the content.
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
          /* Source view — monospace, horizontally scrollable for code/previewable langs */
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

            {/* Main content — horizontally scrollable monospace for code */}
            <ScrollView
              horizontal={isMonospace}
              showsHorizontalScrollIndicator={isMonospace}
              style={
                isMonospace
                  ? {
                      backgroundColor: colors.surfaceBase,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }
                  : undefined
              }
              contentContainerStyle={isMonospace ? { padding: 12 } : undefined}
            >
              <Text
                style={{
                  fontSize: isMonospace ? 13 : 15,
                  lineHeight: isMonospace ? 20 : 24,
                  color: colors.textPrimary,
                  fontFamily: isMonospace
                    ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
                    : undefined,
                }}
                selectable
              >
                {isMonospace
                  ? sourceTokens.map((token, tokenIdx) =>
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
                    )
                  : artifact.content}
              </Text>
            </ScrollView>

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
