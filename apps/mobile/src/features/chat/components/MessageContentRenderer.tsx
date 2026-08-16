
import { View, Linking, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { MathBlock } from './MathBlock';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import {
  classifyExternalLink,
  getSystemIntentPrompt,
} from '@/src/features/chat/utils/externalUrls';
import { tokenizeCode, syntaxTokenColor } from '@/src/features/chat/utils/syntaxHighlight';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';

function openAssistantLink(url: string): void {
  const kind = classifyExternalLink(url);
  if (kind === 'http') {
    void openUntrustedUrlInAppBrowser(url);
    return;
  }
  if (kind !== 'system-intent') return;
  const prompt = getSystemIntentPrompt(url);
  if (!prompt) return;
  Alert.alert(prompt.title, prompt.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => Linking.openURL(url).catch(() => undefined) },
  ]);
}

export function renderInlineMath(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mathRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  let lastIdx = 0;
  let keyCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(
      <MathBlock
        key={`${keyBase}-imath-${keyCounter++}`}
        latex={match[1]!.trim()}
        display={false}
      />,
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

export function renderInlineMarkdown(
  text: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let inlineMatch: RegExpExecArray | null;
  let inlineKey = 0;

  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    if (inlineMatch.index > lastIdx) {
      const plain = text.slice(lastIdx, inlineMatch.index);
      parts.push(...renderInlineMath(plain, `${keyBase}-pre-${inlineKey}`));
    }

    if (inlineMatch[2]) {
      parts.push(
        <Text
          key={`bold-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontWeight: '700' }}
        >
          {inlineMatch[2]}
        </Text>,
      );
    } else if (inlineMatch[3]) {
      parts.push(
        <Text
          key={`italic-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontStyle: 'italic' }}
        >
          {inlineMatch[3]}
        </Text>,
      );
    } else if (inlineMatch[4]) {
      parts.push(
        <Text
          key={`strike-${keyBase}-${inlineKey++}`}
          style={{ textDecorationLine: 'line-through', color: renderColors.textMuted }}
        >
          {inlineMatch[4]}
        </Text>,
      );
    } else if (inlineMatch[5]) {
      parts.push(
        <Text
          key={`code-${keyBase}-${inlineKey++}`}
          style={{
            fontFamily: 'Menlo',
            fontSize: 13,
            backgroundColor: renderColors.surfaceHover,
            color: renderColors.textPrimary,
          }}
        >
          {` ${inlineMatch[5]} `}
        </Text>,
      );
    } else if (inlineMatch[6] && inlineMatch[7]) {
      const linkText = inlineMatch[6];
      const linkUrl = inlineMatch[7];
      parts.push(
        <Text
          key={`link-${keyBase}-${inlineKey++}`}
          style={{
            color: renderColors.teal,
            textDecorationLine: 'underline',
          }}
          onPress={() => openAssistantLink(linkUrl)}
          accessibilityRole="link"
          accessibilityLabel={linkText}
        >
          {linkText}
        </Text>,
      );
    }

    lastIdx = inlineMatch.index + inlineMatch[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(...renderInlineMath(text.slice(lastIdx), `${keyBase}-post`));
  }

  return parts;
}

function renderTextSegment(
  text: string,
  keyBase: string,
  renderColors: ColorScheme,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx]!;

    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]!.length;
      const headerText = headerMatch[2]!;
      const fontSizes: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 15 };
      nodes.push(
        <Text
          key={`${keyBase}-h${level}-${idx}`}
          style={{
            fontSize: fontSizes[level] ?? 15,
            fontWeight: '700',
            color: renderColors.textPrimary,
            marginTop: 8,
            marginBottom: 4,
            lineHeight: (fontSizes[level] ?? 15) * 1.35,
          }}
          selectable
        >
          {renderInlineMarkdown(headerText, `${keyBase}-h${level}il-${idx}`, renderColors)}
        </Text>,
      );
      idx++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (idx < lines.length && lines[idx]!.startsWith('> ')) {
        const body = lines[idx]!.slice(2);
        if (body.trim().length > 0) {
          quoteLines.push(body);
        }
        idx++;
      }
      nodes.push(
        <View
          key={`${keyBase}-bq-${idx}`}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: renderColors.teal,
            paddingLeft: 10,
            paddingVertical: 4,
            marginVertical: 4,
            backgroundColor: renderColors.surfaceBase,
            borderRadius: 4,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontStyle: 'italic',
              color: renderColors.textSecondary,
              lineHeight: 21,
            }}
            selectable
          >
            {renderInlineMarkdown(quoteLines.join('\n'), `${keyBase}-bqil-${idx}`, renderColors)}
          </Text>
        </View>,
      );
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      const listItems: string[] = [];
      while (idx < lines.length && /^[-*]\s+/.test(lines[idx]!)) {
        const m = lines[idx]!.match(/^[-*]\s+(.+)$/);
        if (m) listItems.push(m[1]!);
        idx++;
      }
      nodes.push(
        <View key={`${keyBase}-ul-${idx}`} style={{ marginVertical: 4, gap: 2 }}>
          {listItems.map((item, i) => (
            <View
              key={`${keyBase}-uli-${idx}-${i}`}
              style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: renderColors.teal,
                  lineHeight: 22,
                  width: 12,
                  textAlign: 'center',
                }}
              >
                {'\u2022'}
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: renderColors.textPrimary,
                  lineHeight: 22,
                  flex: 1,
                }}
                selectable
              >
                {renderInlineMarkdown(item, `${keyBase}-ulil-${idx}-${i}`, renderColors)}
              </Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      const listItems: { num: string; text: string }[] = [];
      while (idx < lines.length && /^\d+\.\s+/.test(lines[idx]!)) {
        const m = lines[idx]!.match(/^(\d+)\.\s+(.+)$/);
        if (m) listItems.push({ num: m[1]!, text: m[2]! });
        idx++;
      }
      nodes.push(
        <View key={`${keyBase}-ol-${idx}`} style={{ marginVertical: 4, gap: 2 }}>
          {listItems.map((item, i) => (
            <View
              key={`${keyBase}-oli-${idx}-${i}`}
              style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: renderColors.teal,
                  lineHeight: 22,
                  minWidth: 18,
                  textAlign: 'right',
                }}
              >
                {item.num}.
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: renderColors.textPrimary,
                  lineHeight: 22,
                  flex: 1,
                }}
                selectable
              >
                {renderInlineMarkdown(item.text, `${keyBase}-olil-${idx}-${i}`, renderColors)}
              </Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const parseTableRow = (rowLine: string): string[] => {
      let cells = rowLine.split('|');
      if (cells[0] === '' || (cells[0] && cells[0]!.trim() === '')) {
        cells = cells.slice(1);
      }
      if (
        cells.length > 0 &&
        (cells[cells.length - 1] === '' || cells[cells.length - 1]!.trim() === '')
      ) {
        cells = cells.slice(0, -1);
      }
      return cells.map((cell) => cell.trim());
    };

    if (line.includes('|') && !line.startsWith('>')) {
      const headerCells = parseTableRow(line);
      if (headerCells.length > 0 && idx + 1 < lines.length) {
        const separatorLine = lines[idx + 1];
        if (
          separatorLine &&
          /^\s*\|?[\s\-|:]+\|?[\s\-|:]*$/.test(separatorLine) &&
          separatorLine.includes('-')
        ) {
          const tableRows: string[][] = [];

          const headerRow = parseTableRow(line);
          tableRows.push(headerRow);
          idx += 2;

          while (idx < lines.length && lines[idx]!.includes('|') && !lines[idx]!.startsWith('>')) {
            const bodyRow = parseTableRow(lines[idx]!);
            if (bodyRow.length > 0) {
              tableRows.push(bodyRow);
            }
            idx++;
          }

          if (tableRows.length > 0) {
            const numCols = Math.max(...tableRows.map((row) => row.length));
            nodes.push(
              <ScrollView
                key={`${keyBase}-table-${idx}`}
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginVertical: 8 }}
                contentContainerStyle={{
                  borderWidth: 1,
                  borderColor: renderColors.border,
                  borderRadius: 4,
                  overflow: 'hidden',
                  flexDirection: 'column',
                }}
              >
                {tableRows.map((row, rowIdx) => (
                  <View
                    key={`${keyBase}-tr-${idx}-${rowIdx}`}
                    style={{
                      flexDirection: 'row',
                      borderBottomWidth: rowIdx === 0 ? 1 : 0,
                      borderBottomColor: renderColors.border,
                      backgroundColor: rowIdx === 0 ? renderColors.surfaceHover : undefined,
                    }}
                  >
                    {Array.from({ length: numCols }).map((_, colIdx) => (
                      <View
                        key={`${keyBase}-td-${idx}-${rowIdx}-${colIdx}`}
                        style={{
                          minWidth: 120,
                          maxWidth: 260,
                          borderRightWidth: colIdx < numCols - 1 ? 1 : 0,
                          borderRightColor: renderColors.border,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            color:
                              rowIdx === 0 ? renderColors.textPrimary : renderColors.textSecondary,
                            fontWeight: rowIdx === 0 ? '500' : '400',
                            lineHeight: 19,
                          }}
                          selectable
                        >
                          {row[colIdx] || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>,
            );
          }
          continue;
        }
      }
    }

    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      nodes.push(
        <View
          key={`${keyBase}-hr-${idx}`}
          style={{
            height: 1,
            backgroundColor: renderColors.border,
            marginVertical: 8,
          }}
        />,
      );
      idx++;
      continue;
    }

    if (line.trim()) {
      nodes.push(
        <Text
          key={`${keyBase}-p-${idx}`}
          style={{ color: renderColors.textPrimary, fontSize: 15, lineHeight: 23 }}
          selectable
        >
          {renderInlineMarkdown(line, `${keyBase}-pil-${idx}`, renderColors)}
        </Text>,
      );
    } else if (idx > 0 && idx < lines.length - 1) {
      nodes.push(<View key={`${keyBase}-sp-${idx}`} style={{ height: 8 }} />);
    }
    idx++;
  }

  return nodes;
}

export function renderMarkdownContent(
  content: string,
  renderColors: ColorScheme = defaultColors,
): React.ReactNode[] {
  if (!content) return [];

  const elements: React.ReactNode[] = [];
  let keyCounter = 0;

  const blockRegex = /(\$\$([\s\S]*?)\$\$|```(\w+)?\n?([\s\S]*?)```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      elements.push(...renderTextSegment(textBefore, `seg-${keyCounter++}`, renderColors));
    }

    if (match[2] !== undefined) {
      const mathContent = match[2].trim();
      elements.push(<MathBlock key={`bmath-${keyCounter++}`} latex={mathContent} display={true} />);
    } else if (match[4] !== undefined) {
      const codeContent = match[4].trim();
      const fenceLanguage = match[3];
      const languageLabel =
        fenceLanguage && fenceLanguage.trim().length > 0 ? fenceLanguage : 'Plain text';
      const codeTokens = tokenizeCode(codeContent, fenceLanguage);
      elements.push(
        <View
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: renderColors.surfaceHover,
            borderRadius: 8,
            marginVertical: 6,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingLeft: 12,
              paddingRight: 8,
              paddingTop: 8,
              paddingBottom: 2,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '500',
                color: renderColors.textMuted,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {languageLabel}
            </Text>
            <CodeBlockCopyButton code={codeContent} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            scrollEventThrottle={16}
            style={{
              paddingTop: 2,
              paddingBottom: 10,
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                lineHeight: 19,
                fontFamily: 'Menlo',
                color: renderColors.textPrimary,
              }}
              selectable
            >
              {codeTokens.map((token, tokenIdx) =>
                token.type === 'plain' ? (
                  token.text
                ) : (
                  <Text
                    key={`code-tok-${keyCounter}-${tokenIdx}`}
                    style={{ color: syntaxTokenColor(token.type, renderColors) }}
                  >
                    {token.text}
                  </Text>
                ),
              )}
            </Text>
          </ScrollView>
        </View>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    elements.push(...renderTextSegment(remaining, `seg-tail-${keyCounter++}`, renderColors));
  }

  if (elements.length === 0 && content.length > 0) {
    elements.push(...renderTextSegment(content, 'seg-0', renderColors));
  }

  return elements;
}
