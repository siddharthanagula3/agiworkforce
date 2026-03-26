/**
 * Pure markdown rendering functions extracted from MessageBubble.
 * No state, no hooks — these are deterministic render functions.
 */

import { View, Linking } from 'react-native';
import { Text } from '@/components/ui/text';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { colors } from '@/lib/theme';

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
      <Text
        key={`${keyBase}-imath-${keyCounter++}`}
        style={{
          fontFamily: 'Menlo',
          fontStyle: 'italic',
          fontSize: 13,
          backgroundColor: 'rgba(33, 128, 141, 0.08)',
          color: colors.textPrimary,
        }}
      >
        {` ${match[1]!.trim()} `}
      </Text>,
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
export function renderInlineMarkdown(text: string, keyBase = 'inline'): React.ReactNode[] {
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
        <Text key={`bold-${keyBase}-${inlineKey++}`} style={{ fontWeight: '700' }}>
          {inlineMatch[2]}
        </Text>,
      );
    } else if (inlineMatch[3]) {
      // *italic*
      parts.push(
        <Text key={`italic-${keyBase}-${inlineKey++}`} style={{ fontStyle: 'italic' }}>
          {inlineMatch[3]}
        </Text>,
      );
    } else if (inlineMatch[4]) {
      // ~~strikethrough~~
      parts.push(
        <Text
          key={`strike-${keyBase}-${inlineKey++}`}
          style={{ textDecorationLine: 'line-through', color: 'rgba(245, 247, 251, 0.5)' }}
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
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: colors.textPrimary,
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
            color: colors.teal,
            textDecorationLine: 'underline',
          }}
          onPress={() => {
            try {
              const parsed = new URL(linkUrl);
              if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                Linking.openURL(linkUrl);
              }
            } catch {
              // invalid URL — ignore
            }
          }}
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
function renderTextSegment(text: string, keyBase: string): React.ReactNode[] {
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
            color: colors.textPrimary,
            marginTop: 8,
            marginBottom: 4,
            lineHeight: (fontSizes[level] ?? 15) * 1.35,
          }}
          selectable
        >
          {renderInlineMarkdown(headerText, `${keyBase}-h${level}il-${idx}`)}
        </Text>,
      );
      idx++;
      continue;
    }

    // --- Blockquote: > text ---
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (idx < lines.length && lines[idx]!.startsWith('> ')) {
        quoteLines.push(lines[idx]!.slice(2));
        idx++;
      }
      nodes.push(
        <View
          key={`${keyBase}-bq-${idx}`}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: colors.teal,
            paddingLeft: 10,
            paddingVertical: 4,
            marginVertical: 4,
            backgroundColor: 'rgba(33, 128, 141, 0.06)',
            borderRadius: 4,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontStyle: 'italic',
              color: 'rgba(245, 247, 251, 0.7)',
              lineHeight: 21,
            }}
            selectable
          >
            {renderInlineMarkdown(quoteLines.join('\n'), `${keyBase}-bqil-${idx}`)}
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
                  color: colors.teal,
                  lineHeight: 22,
                  width: 12,
                  textAlign: 'center',
                }}
              >
                {'\u2022'}
              </Text>
              <Text
                style={{ fontSize: 15, color: 'rgba(245, 247, 251, 0.9)', lineHeight: 22, flex: 1 }}
                selectable
              >
                {renderInlineMarkdown(item, `${keyBase}-ulil-${idx}-${i}`)}
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
                  color: colors.teal,
                  lineHeight: 22,
                  minWidth: 18,
                  textAlign: 'right',
                }}
              >
                {item.num}.
              </Text>
              <Text
                style={{ fontSize: 15, color: 'rgba(245, 247, 251, 0.9)', lineHeight: 22, flex: 1 }}
                selectable
              >
                {renderInlineMarkdown(item.text, `${keyBase}-olil-${idx}-${i}`)}
              </Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // --- Horizontal rule: --- or *** or ___ ---
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      nodes.push(
        <View
          key={`${keyBase}-hr-${idx}`}
          style={{
            height: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
          className="text-[15px] leading-relaxed text-white/90"
          selectable
        >
          {renderInlineMarkdown(line, `${keyBase}-pil-${idx}`)}
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
export function renderMarkdownContent(content: string): React.ReactNode[] {
  if (!content) return [];

  const elements: React.ReactNode[] = [];
  let keyCounter = 0;

  const blockRegex = /(\$\$([\s\S]*?)\$\$|```(?:\w+)?\n?([\s\S]*?)```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      elements.push(...renderTextSegment(textBefore, `seg-${keyCounter++}`));
    }

    if (match[2] !== undefined) {
      const mathContent = match[2].trim();
      elements.push(
        <View
          key={`bmath-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(33, 128, 141, 0.08)',
            borderRadius: 6,
            padding: 8,
            marginVertical: 6,
            borderLeftWidth: 2,
            borderLeftColor: colors.teal,
          }}
        >
          <Text
            style={{
              fontFamily: 'Menlo',
              fontStyle: 'italic',
              fontSize: 14,
              color: colors.textPrimary,
              textAlign: 'center',
              lineHeight: 22,
            }}
            selectable
          >
            {mathContent}
          </Text>
        </View>,
      );
    } else if (match[3] !== undefined) {
      const codeContent = match[3].trim();
      elements.push(
        <View
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 8,
            padding: 10,
            paddingTop: 28,
            marginVertical: 6,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.06)',
          }}
        >
          <CodeBlockCopyButton code={codeContent} />
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              fontFamily: 'Menlo',
              color: 'rgba(245, 247, 251, 0.85)',
            }}
            selectable
          >
            {codeContent}
          </Text>
        </View>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    elements.push(...renderTextSegment(remaining, `seg-tail-${keyCounter++}`));
  }

  if (elements.length === 0 && content.length > 0) {
    elements.push(...renderTextSegment(content, 'seg-0'));
  }

  return elements;
}
