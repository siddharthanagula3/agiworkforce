/**
 * Pure markdown rendering functions extracted from MessageBubble.
 * No state, no hooks — these are deterministic render functions.
 */

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

/**
 * Opens an assistant-emitted link. http/https opens directly; system-intent
 * schemes (mailto:/sms:/tel:/geo:) are zero-permission handoffs to the default
 * system app but still require a confirmation tap because the URL is untrusted
 * model output. Everything else is silently ignored.
 */
function openAssistantLink(url: string): void {
  const kind = classifyExternalLink(url);
  if (kind === 'http') {
    Linking.openURL(url).catch(() => undefined);
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

/**
 * Render inline math: $...$ (not $$)
 * Returns an array of React Native Text/View nodes.
 */
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

/**
 * Handles inline formatting: **bold**, *italic*, ~~strikethrough~~,
 * `code`, [links](url), and $inline math$.
 */
export function renderInlineMarkdown(
  text: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Order matters: bold (**) before italic (*), links before other patterns
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
      // **bold**
      parts.push(
        <Text
          key={`bold-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontWeight: '700' }}
        >
          {inlineMatch[2]}
        </Text>,
      );
    } else if (inlineMatch[3]) {
      // *italic*
      parts.push(
        <Text
          key={`italic-${keyBase}-${inlineKey++}`}
          style={{ color: renderColors.textPrimary, fontStyle: 'italic' }}
        >
          {inlineMatch[3]}
        </Text>,
      );
    } else if (inlineMatch[4]) {
      // ~~strikethrough~~
      parts.push(
        <Text
          key={`strike-${keyBase}-${inlineKey++}`}
          style={{ textDecorationLine: 'line-through', color: renderColors.textMuted }}
        >
          {inlineMatch[4]}
        </Text>,
      );
    } else if (inlineMatch[5]) {
      // `inline code`
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
      // [link text](url)
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

/**
 * Renders a plain text segment (between block-level elements) with support for
 * headers, blockquotes, unordered lists, ordered lists, and inline markdown.
 */
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

    // --- Headers: # through #### ---
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

    // --- Blockquote: > text ---
    //
    // FIX (audit 2026-05-20, §14): the legacy code matched any line
    // starting with `> ` and pushed `.slice(2)`. For a line that was
    // exactly `> ` (the quote marker with no body), this yielded an
    // empty string that downstream rendered as a blank line inside the
    // quote box. Worse, it could collapse a `>` followed by trailing
    // whitespace into a silent empty quote — a renderer-side glitch the
    // author cannot see.
    //
    // Now: skip empty / whitespace-only quote-body lines explicitly so
    // the rendered blockquote only contains lines that have real content.
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

    // --- Unordered list: - item or * item ---
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

    // --- Ordered list: 1. item ---
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

    // --- Markdown table: | cell | cell | (with header separator line) ---
    // Helper: parse table row, preserving interior empty cells
    // Input: "| a | | c |" → split → ['', ' a ', ' ', ' c ', '']
    // Drop first/last if empty (outer pipe artifacts) → [' a ', ' ', ' c ']
    // Trim each → ['a', '', 'c']
    const parseTableRow = (rowLine: string): string[] => {
      let cells = rowLine.split('|');
      // Remove first element if it's empty (leading pipe artifact)
      if (cells[0] === '' || (cells[0] && cells[0]!.trim() === '')) {
        cells = cells.slice(1);
      }
      // Remove last element if it's empty (trailing pipe artifact)
      if (
        cells.length > 0 &&
        (cells[cells.length - 1] === '' || cells[cells.length - 1]!.trim() === '')
      ) {
        cells = cells.slice(0, -1);
      }
      // Trim each cell but keep empty strings (interior empty cells)
      return cells.map((cell) => cell.trim());
    };

    if (line.includes('|') && !line.startsWith('>')) {
      // Check if this looks like a table header (contains pipes and content)
      const headerCells = parseTableRow(line);
      if (headerCells.length > 0 && idx + 1 < lines.length) {
        const separatorLine = lines[idx + 1];
        // Check if next line is a table separator: |---|---|--- format
        if (
          separatorLine &&
          /^\s*\|?[\s\-|:]+\|?[\s\-|:]*$/.test(separatorLine) &&
          separatorLine.includes('-')
        ) {
          // This is a table! Collect all rows until we hit a non-table line
          const tableRows: string[][] = [];

          // Parse header row
          const headerRow = parseTableRow(line);
          tableRows.push(headerRow);
          idx += 2; // Skip header and separator

          // Parse body rows
          while (idx < lines.length && lines[idx]!.includes('|') && !lines[idx]!.startsWith('>')) {
            const bodyRow = parseTableRow(lines[idx]!);
            if (bodyRow.length > 0) {
              tableRows.push(bodyRow);
            }
            idx++;
          }

          // Render table
          if (tableRows.length > 0) {
            const numCols = Math.max(...tableRows.map((row) => row.length));
            nodes.push(
              <View
                key={`${keyBase}-table-${idx}`}
                style={{
                  borderWidth: 1,
                  borderColor: renderColors.border,
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginVertical: 8,
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
                          flex: 1,
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
              </View>,
            );
          }
          continue;
        }
      }
    }

    // --- Horizontal rule: --- or *** or ___ ---
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

    // --- Plain text with inline markdown ---
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
      // Empty line between content — render as vertical space
      nodes.push(<View key={`${keyBase}-sp-${idx}`} style={{ height: 8 }} />);
    }
    idx++;
  }

  return nodes;
}

/**
 * Renders markdown content with support for:
 * - **bold**, *italic*, ~~strikethrough~~
 * - `inline code` and ```code blocks```
 * - [links](url)
 * - $$...$$ block math and $...$ inline math
 * - # headers (h1 through h4)
 * - > blockquotes
 * - - unordered lists and 1. ordered lists
 * - --- horizontal rules
 *
 * Returns an array of React Native Text/View elements.
 */
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
      const codeTokens = tokenizeCode(codeContent, match[3]);
      elements.push(
        <View
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: renderColors.surfaceHover,
            borderRadius: 8,
            marginVertical: 6,
            borderWidth: 1,
            borderColor: renderColors.border,
            overflow: 'hidden',
          }}
        >
          <CodeBlockCopyButton code={codeContent} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            scrollEventThrottle={16}
            style={{
              paddingTop: 28,
              paddingBottom: 10,
              paddingHorizontal: 10,
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
