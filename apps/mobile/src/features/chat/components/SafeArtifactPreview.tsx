import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  isRenderableSvg,
  parseArtifactPreviewError,
  parseMermaidPreviewMessage,
  type MermaidAppearance,
  type MermaidDrawing,
  type PreviewableKind,
} from './sandboxedArtifactHtml';

export type { MermaidDrawing, PreviewableKind } from './sandboxedArtifactHtml';

import { isAllowedPreviewNavigation } from './previewNavigationPolicy';
import { loadMermaidRuntime } from './mermaidRuntime';
import { openAssistantLink } from './MarkdownInline';
import { resolveAnswerLink } from '@/src/features/chat/utils/answerLinks';
import { linkDisplayText, linkOpenTarget } from '@/src/features/chat/utils/externalUrls';

const MAX_RECLAIM_RECOVERIES = 3;
const RECLAIMED_REASON = 'the system stopped it to free memory';
const LOAD_TIMEOUT_MS = 20_000;
const LOAD_TIMEOUT_REASON = 'it took too long to load';
const LOAD_TIMEOUT_HEADLINE = 'This preview did not finish loading.';
const INVALID_SVG_REASON = 'The SVG is missing its closing tag or is not valid.';
const MAX_UNTAKEN_LINK_OFFERS = 3;
const LINK_OFFER_QUIET_MS = 1_000;

type MermaidRuntimeState = { runtime: string } | { failed: true } | null;
type PreviewNavigationRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0];
interface LinkOffers {
  asking: boolean;
  untaken: number;
  quietUntil: number;
}

const FRESH_LINK_OFFERS: LinkOffers = { asking: false, untaken: 0, quietUntil: 0 };

function useMermaidRuntime(enabled: boolean): MermaidRuntimeState {
  const [state, setState] = useState<MermaidRuntimeState>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadMermaidRuntime().then(
      (runtime) => {
        if (live) setState({ runtime });
      },
      () => {
        if (live) setState({ failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

export interface SafeArtifactPreviewProps {
  content: string;
  kind: PreviewableKind;
  style?: StyleProp<ViewStyle>;
  appearance?: MermaidAppearance;
  scrollEnabled?: boolean;
  onDiagramRendered?: (height: number, drawing: MermaidDrawing) => void;
  onDiagramFailed?: (reason: string) => void;
  onViewSource?: () => void;
  showsLoading?: boolean;
}

export function SafeArtifactPreview({
  content,
  kind,
  style,
  appearance,
  scrollEnabled,
  onDiagramRendered,
  onDiagramFailed,
  onViewSource,
  showsLoading = false,
}: SafeArtifactPreviewProps) {
  const colors = useThemeColors();
  const isMermaid = kind === 'mermaid';
  const runsScripts = kind === 'html' || kind === 'react';
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reclaims, setReclaims] = useState(0);
  const [loadedAttempt, setLoadedAttempt] = useState<number | null>(null);
  const settled = useRef(false);
  const linkOffers = useRef<LinkOffers>({ ...FRESH_LINK_OFFERS });
  const reportFailure = useRef(onDiagramFailed);
  reportFailure.current = onDiagramFailed;
  const [shown, setShown] = useState({ content, kind });
  if (shown.content !== content || shown.kind !== kind) {
    setShown({ content, kind });
    setRuntimeError(null);
    setReclaims(0);
    setAttempt((value) => value + 1);
  }
  const mermaidRuntime = useMermaidRuntime(isMermaid);
  const html = useMemo(() => {
    if (!isMermaid) return buildSandboxedArtifactHtml(content, kind);
    return mermaidRuntime && 'runtime' in mermaidRuntime
      ? buildMermaidPreviewHtml(content, mermaidRuntime.runtime, appearance)
      : null;
  }, [content, kind, isMermaid, appearance, mermaidRuntime]);
  const reportsDiagram = isMermaid && Boolean(onDiagramRendered || onDiagramFailed);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMermaidPreviewMessage(event.nativeEvent.data);
      if (message) settled.current = true;
      if (message?.type === 'rendered') {
        onDiagramRendered?.(message.height, { width: message.width, svg: message.svg });
      } else if (message?.type === 'failed') onDiagramFailed?.(message.reason);
    },
    [onDiagramRendered, onDiagramFailed],
  );
  const handleLoadError = useCallback(() => onDiagramFailed?.(''), [onDiagramFailed]);
  useEffect(() => {
    linkOffers.current = { ...FRESH_LINK_OFFERS };
  }, [attempt]);
  const handleNavigation = useCallback((request: PreviewNavigationRequest) => {
    if (isAllowedPreviewNavigation(request.url)) return true;
    const offers = linkOffers.current;
    if (
      request.isTopFrame === false ||
      offers.asking ||
      offers.untaken >= MAX_UNTAKEN_LINK_OFFERS ||
      Date.now() < offers.quietUntil
    ) {
      return false;
    }
    const link = resolveAnswerLink(request.url);
    if (link.kind === 'plain') return false;
    const settle = (taken: boolean) => {
      offers.asking = false;
      if (!taken) offers.untaken += 1;
      offers.quietUntil = Date.now() + LINK_OFFER_QUIET_MS;
    };
    if (link.kind === 'system') {
      settle(false);
      openAssistantLink(request.url);
      return false;
    }
    offers.asking = true;
    Alert.alert(
      'Open link?',
      linkDisplayText(linkOpenTarget(request.url)),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => settle(false) },
        {
          text: 'Open',
          onPress: () => {
            settle(true);
            openAssistantLink(request.url);
          },
        },
      ],
      { onDismiss: () => settle(false) },
    );
    return false;
  }, []);
  const handleReclaimed = useCallback(() => {
    if (reclaims < MAX_RECLAIM_RECOVERIES) {
      setReclaims((value) => value + 1);
      setAttempt((value) => value + 1);
    } else if (reportsDiagram) {
      onDiagramFailed?.(RECLAIMED_REASON);
    } else {
      setRuntimeError(RECLAIMED_REASON);
    }
  }, [reclaims, reportsDiagram, onDiagramFailed]);
  const handleLoadEnd = useCallback(() => {
    if (!isMermaid) settled.current = true;
    if (showsLoading) setLoadedAttempt(attempt);
  }, [isMermaid, showsLoading, attempt]);
  const isEmpty = !isMermaid && content.trim().length === 0;
  const invalidSvg = kind === 'svg' && !isEmpty && !isRenderableSvg(content);
  const loading = html !== null && !isEmpty && !invalidSvg && runtimeError === null;
  const watchesLoad = !isMermaid || reportsDiagram;
  useEffect(() => {
    settled.current = false;
    if (!loading || !watchesLoad) return;
    const timer = setTimeout(() => {
      if (settled.current) return;
      if (isMermaid) reportFailure.current?.(LOAD_TIMEOUT_REASON);
      else setRuntimeError(LOAD_TIMEOUT_REASON);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt, loading, watchesLoad, isMermaid]);
  const runtimeFailed = Boolean(mermaidRuntime && 'failed' in mermaidRuntime);
  useEffect(() => {
    if (runtimeFailed) onDiagramFailed?.('');
  }, [runtimeFailed, onDiagramFailed]);
  const handleRuntimeMessage = useCallback((event: WebViewMessageEvent) => {
    const report = parseArtifactPreviewError(event.nativeEvent.data);
    if (report) setRuntimeError(report.message);
  }, []);

  if (isEmpty) {
    return (
      <View style={[style, { padding: 16, justifyContent: 'center', alignItems: 'center' }]}>
        <Text variant="caption" style={{ color: colors.textMuted }}>
          Nothing to preview yet.
        </Text>
      </View>
    );
  }

  if (runtimeError !== null || invalidSvg) {
    return (
      <View
        style={[style, { padding: 16, gap: 12, justifyContent: 'center' }]}
        accessibilityRole="alert"
      >
        <Text style={{ color: colors.textPrimary }}>
          {invalidSvg
            ? "This image couldn't be rendered."
            : runtimeError === LOAD_TIMEOUT_REASON
              ? LOAD_TIMEOUT_HEADLINE
              : 'This preview stopped with an error.'}
        </Text>
        {runtimeError === LOAD_TIMEOUT_REASON ? null : (
          <Text variant="caption" style={{ color: colors.textMuted }} selectable>
            {invalidSvg ? INVALID_SVG_REASON : runtimeError}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {invalidSvg ? null : (
            <Button
              title="Retry"
              variant="secondary"
              size="sm"
              accessibilityLabel="Run the preview again"
              onPress={() => {
                setRuntimeError(null);
                setReclaims(0);
                setAttempt((value) => value + 1);
              }}
            />
          )}
          {onViewSource ? (
            <Button
              title="View source"
              variant="ghost"
              size="sm"
              accessibilityLabel="Show the artifact source"
              onPress={onViewSource}
            />
          ) : null}
        </View>
      </View>
    );
  }

  if (html === null) return <View style={style} />;

  const webView = (
    <WebView
      key={attempt}
      source={{ html }}
      style={showsLoading ? { flex: 1 } : style}
      originWhitelist={['*']}
      javaScriptEnabled={isMermaid || runsScripts}
      domStorageEnabled={false}
      incognito={!isMermaid}
      cacheEnabled={isMermaid}
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={handleNavigation}
      overScrollMode="never"
      bounces={!isMermaid}
      directionalLockEnabled
      onContentProcessDidTerminate={handleReclaimed}
      onRenderProcessGone={handleReclaimed}
      accessibilityRole="image"
      accessibilityLabel={`${kind.toUpperCase()} artifact preview`}
      scrollEnabled={scrollEnabled ?? true}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      onMessage={reportsDiagram ? handleMessage : runsScripts ? handleRuntimeMessage : undefined}
      onError={reportsDiagram ? handleLoadError : undefined}
      onLoadEnd={handleLoadEnd}
    />
  );
  if (!showsLoading) return webView;
  return (
    <View style={style}>
      {webView}
      {loadedAttempt === attempt ? null : (
        <View
          testID="artifact-preview-loading"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading preview"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.background,
            },
          ]}
        >
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
}
