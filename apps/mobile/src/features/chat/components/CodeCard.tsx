import { useState, type ReactNode } from 'react';
import {
  View,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, Maximize2, SquarePen, X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { TranscriptFontContext } from '@/components/ui/transcriptFont';
import { diffLineText } from '@/src/features/settings/code/codeAppearance';
import {
  useCodeFontFamily,
  useShowDiffSigns,
} from '@/src/features/settings/code/useCodeAppearance';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import {
  CodeLinesScroller,
  type CodeLinesCap,
} from '@/src/features/settings/code/CodeLinesScroller';
import type { ColorScheme } from '@/src/ui/theme';
import { HEADER_TEXT_SCALE_LIMIT, spacing, typeScale } from '@/src/ui/theme/tokens';
import {
  expandCodeTabs,
  tokenizeCode,
  syntaxTokenColor,
  type SyntaxToken,
} from '@/src/features/chat/utils/syntaxHighlight';
import { exportSourceFile, shareFile } from '@/services/fileCreation';
import { CodeFullScreen } from './CodeFullScreen';
import { useAnswerDraft } from './answerDraftStore';
import { answerDraftKey, useAssistantDraftScope } from './AssistantDraftScope';
import {
  FULL_SCREEN_TOUCH_TARGET,
  useFullScreenChrome,
} from '@/src/features/chat/chrome/fullScreenChrome';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import {
  CODE_CARD_EDIT_FAILED,
  savedCodeCardEdit,
  storeCodeCardForEditing,
  type CodeCardEditTarget,
} from '@/src/features/chat/services/codeCardEdit';
import { PageSheetSafeArea } from './ModalSafeArea';
import { SideScrollerRegistry } from './SideScroller';
import { SafeArtifactPreview } from './SafeArtifactPreview';
import { codeFileFor } from '@agiworkforce/unified-chat/code-file-name';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat/tabular';

const PLAIN_TEXT_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['text', 'txt', 'plaintext']);
const DIFF_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['diff', 'patch', 'udiff']);
const SHELL_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['bash', 'sh', 'shell', 'zsh']);
const CODE_BODY_PADDING_TOP = 2;

const CODE_LINE_STYLE = {
  fontSize: typeScale.footnote,
  lineHeight: 19,
};

type DiffLineKind = 'added' | 'removed' | 'context';

const DIFF_LINE_LABELS: Record<DiffLineKind, string> = {
  added: 'Added line: ',
  removed: 'Removed line: ',
  context: '',
};

function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

function diffLineFill(kind: DiffLineKind, colors: ColorScheme): string {
  if (kind === 'added') return colors.diffAddedFill;
  if (kind === 'removed') return colors.diffRemovedFill;
  return colors.transparent;
}

function diffLineInk(kind: DiffLineKind, colors: ColorScheme): string {
  if (kind === 'added') return colors.diffAddedText;
  if (kind === 'removed') return colors.diffRemovedText;
  return colors.textPrimary;
}

function DiffCodeLines({
  code,
  colors,
  selectable,
  cap,
}: {
  code: string;
  colors: ColorScheme;
  selectable: boolean;
  cap?: CodeLinesCap;
}) {
  const fontFamily = useCodeFontFamily();
  const showSigns = useShowDiffSigns();
  return (
    <CodeLinesScroller
      showsIndicator
      {...(cap ? { cap } : {})}
      testID="markdown-diff"
      style={{ paddingTop: CODE_BODY_PADDING_TOP, paddingBottom: 10 }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={{ flexGrow: 1 }}>
        {code.split('\n').map((line, lineIdx) => {
          const kind = diffLineKind(line);
          const announced = showSigns || kind === 'context' ? line : line.slice(1);
          const shown = expandCodeTabs([
            { text: diffLineText(line, kind, showSigns), type: 'plain' },
          ])[0]!.text;
          return (
            <View
              key={`${lineIdx}-${line}`}
              accessible
              accessibilityLabel={`${DIFF_LINE_LABELS[kind]}${announced}`}
              testID={`markdown-diff-line-${kind}`}
              style={{ paddingHorizontal: 12, backgroundColor: diffLineFill(kind, colors) }}
            >
              <Text
                style={{ ...CODE_LINE_STYLE, fontFamily, color: diffLineInk(kind, colors) }}
                selectable={selectable}
              >
                {shown || ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </CodeLinesScroller>
  );
}

export function codeDownloadFile(
  code: string,
  fenceLanguage: string | undefined,
): { body: string; title: string; extension: string } {
  const file = codeFileFor(fenceLanguage ?? '');
  const title = file.extension
    ? file.fileName.slice(0, -(file.extension.length + 1))
    : file.fileName;
  return {
    body: spreadsheetSafeExport(code, file.extension).body,
    title,
    extension: file.extension,
  };
}

function downloadCodeBlock(code: string, fenceLanguage: string | undefined): void {
  const file = codeDownloadFile(code, fenceLanguage);
  void exportSourceFile(file.body, file.title, file.extension)
    .then((result) => shareFile(result.uri))
    .catch(() => {
      Alert.alert('Download failed', 'Could not save this code as a file. Try again.');
    });
}

const CODE_CAP_LINES = 20;
const HTML_PREVIEW_LANGUAGES: ReadonlySet<string> = new Set(['html', 'htm']);
const SEPARATE_EDITOR_LANGUAGES: ReadonlySet<string> = new Set(['mermaid']);
const HTML_PREVIEW_PENDING = 'The HTML preview will appear when this block is complete.';
const HTML_PREVIEW_CLOSE_LABEL = 'Close HTML preview';
const CODE_HEADER_BUTTON_STYLE = {
  minWidth: FULL_SCREEN_TOUCH_TARGET,
  minHeight: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function CodeDownloadButton({
  code,
  fenceLanguage,
  color,
}: {
  code: string;
  fenceLanguage: string | undefined;
  color: string;
}) {
  return (
    <Pressable
      onPress={() => downloadCodeBlock(code, fenceLanguage)}
      accessibilityRole="button"
      accessibilityLabel={`Download ${codeFileFor(fenceLanguage ?? '').fileName}`}
      style={CODE_HEADER_BUTTON_STYLE}
    >
      <Download size={14} color={color} />
    </Pressable>
  );
}

type HtmlPreviewMode = 'preview' | 'source';

function HtmlPreviewSheet({
  code,
  colors,
  source,
  onClose,
}: {
  code: string;
  colors: ColorScheme;
  source: ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<HtmlPreviewMode>('preview');
  const chrome = useFullScreenChrome({
    surface: 'html-preview',
    back: { onPress: onClose, label: HTML_PREVIEW_CLOSE_LABEL },
    close: { onPress: onClose, label: HTML_PREVIEW_CLOSE_LABEL },
  });
  useDismissOnScreenBlur(true, onClose);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={chrome.onRequestClose}
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          testID="html-preview-sheet"
          accessibilityViewIsModal
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0,
          }}
        >
          <View
            style={{
              paddingLeft: spacing.lg,
              paddingRight: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: typeScale.body,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                HTML preview
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CodeBlockCopyButton code={code} />
                <Pressable
                  {...chrome.close}
                  style={{ ...chrome.close.style, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
            <View
              accessibilityRole="tablist"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
            >
              {(['preview', 'source'] as const).map((tab) => {
                const selected = mode === tab;
                const label = tab === 'preview' ? 'Preview' : 'Source';
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setMode(tab)}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected }}
                    style={{
                      minHeight: FULL_SCREEN_TOUCH_TARGET,
                      paddingRight: spacing.sm,
                      justifyContent: 'center',
                    }}
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
                  </Pressable>
                );
              })}
            </View>
          </View>
          {mode === 'preview' ? (
            <SafeArtifactPreview
              content={code}
              kind="html"
              style={{ flex: 1 }}
              showsLoading
              onViewSource={() => setMode('source')}
            />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: spacing.sm }}
              testID="html-preview-source"
            >
              <SideScrollerRegistry.Provider value={null}>{source}</SideScrollerRegistry.Provider>
            </ScrollView>
          )}
        </View>
      </PageSheetSafeArea>
    </Modal>
  );
}

function CodeEditorScreen({
  target,
  onClose,
}: {
  target: CodeCardEditTarget;
  onClose: () => void;
}) {
  // Required lazily: ArtifactFullScreen imports MessageContentRenderer, which imports this card.
  const { ArtifactFullScreen } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./ArtifactFullScreen') as typeof import('./ArtifactFullScreen');
  return (
    <ArtifactFullScreen
      artifact={target.artifact}
      visible
      onClose={onClose}
      conversationId={target.conversationId}
      messageId={target.messageId}
      initialMode="edit"
    />
  );
}

export function CodeCard({
  blockKey,
  codeContent,
  fenceLanguage,
  highlightCode,
  streaming,
  fenceClosed,
  renderColors,
  selectable,
  capCode,
}: {
  blockKey: string;
  codeContent: string;
  fenceLanguage: string | undefined;
  highlightCode: boolean;
  streaming: boolean;
  fenceClosed: boolean;
  renderColors: ColorScheme;
  selectable: boolean;
  capCode: boolean;
}) {
  const scope = useAssistantDraftScope();
  const { fontScale } = useWindowDimensions();
  const codeFont = useCodeFontFamily();
  const [showAll, setShowAll, resetShowAll] = useAnswerDraft<boolean>(
    answerDraftKey(scope, 'code-lines', blockKey),
    false,
  );
  const [fullScreen, setFullScreen] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [editing, setEditing] = useState<CodeCardEditTarget | null>(null);
  const languageLabel =
    fenceLanguage && fenceLanguage.length > 0 ? fenceLanguage.toLowerCase() : 'Plain text';
  const shellCommands = SHELL_FENCE_LANGUAGES.has(languageLabel);
  const isDiff = DIFF_FENCE_LANGUAGES.has(fenceLanguage?.toLowerCase() ?? '');
  const tokensOf = (code: string): SyntaxToken[] =>
    expandCodeTabs(
      highlightCode && !isDiff
        ? tokenizeCode(code, fenceLanguage)
        : [{ text: code, type: 'plain' }],
    );
  const wrapsLongLines =
    !fenceLanguage || PLAIN_TEXT_FENCE_LANGUAGES.has(fenceLanguage.toLowerCase());
  const hasCode = codeContent.trim().length > 0;
  const finished = fenceClosed && !streaming && hasCode;
  const previewsHtml = HTML_PREVIEW_LANGUAGES.has(languageLabel);
  const canEdit =
    scope !== null &&
    capCode &&
    highlightCode &&
    finished &&
    !SEPARATE_EDITOR_LANGUAGES.has(languageLabel);
  const startEditing = () => {
    if (!scope) return;
    const target = storeCodeCardForEditing(scope.messageId, codeContent, fenceLanguage);
    if (target) setEditing(target);
    else Alert.alert('Edit failed', CODE_CARD_EDIT_FAILED);
  };
  const startPreview = () => {
    const saved = scope ? savedCodeCardEdit(scope.messageId, codeContent, fenceLanguage) : null;
    setPreviewCode(saved ?? codeContent);
  };
  const overCap =
    capCode && !streaming && codeContent.replace(/\n+$/, '').split('\n').length > CODE_CAP_LINES;
  const lineHeight = CODE_LINE_STYLE.lineHeight * fontScale;
  const cap: CodeLinesCap | undefined =
    overCap && !showAll
      ? {
          maxHeight: CODE_CAP_LINES * lineHeight + CODE_BODY_PADDING_TOP,
          fadeColor: renderColors.surfaceHover,
          fadeHeight: lineHeight,
        }
      : undefined;
  const codeText = (code: string) => (
    <Text
      style={{ ...CODE_LINE_STYLE, fontFamily: codeFont, color: renderColors.textPrimary }}
      selectable={selectable}
      accessibilityLabel={`${languageLabel} code block`}
      accessibilityValue={{ text: code }}
    >
      {tokensOf(code).map((token, tokenIdx) =>
        token.type === 'plain' ? (
          token.text
        ) : (
          <Text
            key={`${blockKey}-tok-${tokenIdx}`}
            style={{ color: syntaxTokenColor(token.type, renderColors) }}
          >
            {token.text}
          </Text>
        ),
      )}
    </Text>
  );
  const renderBody = (bodyCap: CodeLinesCap | undefined, code: string = codeContent) =>
    isDiff ? (
      <DiffCodeLines
        code={code}
        colors={renderColors}
        selectable={selectable}
        {...(bodyCap ? { cap: bodyCap } : {})}
      />
    ) : (
      <CodeLinesScroller
        alwaysWrap={wrapsLongLines}
        showsIndicator
        style={{
          paddingTop: CODE_BODY_PADDING_TOP,
          paddingBottom: 10,
          paddingHorizontal: 12,
        }}
        {...(bodyCap ? { cap: bodyCap } : {})}
      >
        {codeText(code)}
      </CodeLinesScroller>
    );
  return (
    <View
      style={{
        backgroundColor: renderColors.surfaceHover,
        borderRadius: 8,
        marginVertical: 6,
        overflow: 'hidden',
      }}
    >
      <View
        testID="code-card-header"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: FULL_SCREEN_TOUCH_TARGET,
          paddingLeft: 12,
        }}
      >
        <Text
          style={{
            fontSize: typeScale.caption,
            fontWeight: '500',
            color: renderColors.textMuted,
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {languageLabel}
        </Text>
        <View testID="code-card-actions" style={{ flexDirection: 'row', alignItems: 'center' }}>
          {previewsHtml && finished ? (
            <Pressable
              onPress={startPreview}
              accessibilityRole="button"
              accessibilityLabel="Preview HTML"
              style={{ ...CODE_HEADER_BUTTON_STYLE, paddingHorizontal: spacing.sm }}
            >
              <Text
                maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '500',
                  color: renderColors.textSecondary,
                }}
              >
                Preview
              </Text>
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable
              onPress={startEditing}
              accessibilityRole="button"
              accessibilityLabel="Edit code"
              style={CODE_HEADER_BUTTON_STYLE}
            >
              <SquarePen size={14} color={renderColors.textMuted} />
            </Pressable>
          ) : null}
          {highlightCode && hasCode ? (
            <CodeDownloadButton
              code={codeContent}
              fenceLanguage={fenceLanguage}
              color={renderColors.textMuted}
            />
          ) : null}
          <CodeBlockCopyButton code={codeContent} />
          {capCode && !streaming && hasCode ? (
            <Pressable
              onPress={() => setFullScreen(true)}
              accessibilityRole="button"
              accessibilityLabel="Expand code"
              style={CODE_HEADER_BUTTON_STYLE}
            >
              <Maximize2 size={14} color={renderColors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {renderBody(cap)}
      {overCap ? (
        <Pressable
          onPress={() => (showAll ? resetShowAll() : setShowAll(true))}
          accessibilityRole="button"
          accessibilityLabel={showAll ? 'Show less code' : 'Show more code'}
          accessibilityState={{ expanded: showAll }}
          style={{
            minHeight: FULL_SCREEN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: renderColors.border,
          }}
        >
          <Text
            style={{
              fontSize: typeScale.caption,
              fontWeight: '500',
              color: renderColors.textSecondary,
            }}
          >
            {showAll ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      ) : null}
      {shellCommands ? (
        <Text
          testID="code-commands-not-run"
          style={{
            fontSize: typeScale.caption,
            color: renderColors.textSecondary,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: renderColors.border,
          }}
        >
          These commands are examples only; they have not been executed.
        </Text>
      ) : null}
      {previewsHtml && streaming && hasCode ? (
        <Text
          testID="html-preview-pending"
          accessibilityLiveRegion="polite"
          style={{
            fontSize: typeScale.caption,
            color: renderColors.textSecondary,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: renderColors.border,
          }}
        >
          {HTML_PREVIEW_PENDING}
        </Text>
      ) : null}
      {previewCode !== null || editing || fullScreen ? (
        <TranscriptFontContext.Provider value={null}>
          {previewCode !== null ? (
            <HtmlPreviewSheet
              code={previewCode}
              colors={renderColors}
              source={renderBody(undefined, previewCode)}
              onClose={() => setPreviewCode(null)}
            />
          ) : null}
          {editing ? <CodeEditorScreen target={editing} onClose={() => setEditing(null)} /> : null}
          {fullScreen ? (
            <CodeFullScreen
              visible
              title={languageLabel}
              colors={renderColors}
              onClose={() => setFullScreen(false)}
              actions={
                <>
                  {hasCode ? (
                    <CodeDownloadButton
                      code={codeContent}
                      fenceLanguage={fenceLanguage}
                      color={renderColors.textSecondary}
                    />
                  ) : null}
                  <CodeBlockCopyButton code={codeContent} />
                </>
              }
            >
              {renderBody(undefined)}
            </CodeFullScreen>
          ) : null}
        </TranscriptFontContext.Provider>
      ) : null}
    </View>
  );
}
