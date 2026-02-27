/**
 * Minimal markdown parsing for chat messages.
 * Handles: **bold**, *italic*, `inline code`, ```code blocks```,
 * and thinking/reasoning tags.
 */

export interface ParsedSegment {
  type: 'text' | 'bold' | 'italic' | 'code' | 'codeBlock' | 'thinking';
  content: string;
  language?: string;
}

/**
 * Extract thinking/reasoning blocks from message content.
 * Supported formats: <thinking>...</thinking>, <reasoning>...</reasoning>,
 * <antThinking>...</antThinking>, <internal_monologue>...</internal_monologue>
 */
export function extractThinkingBlocks(content: string): {
  visibleContent: string;
  thinkingContent: string | null;
} {
  const thinkingPatterns = [
    /<thinking>([\s\S]*?)<\/thinking>/gi,
    /<reasoning>([\s\S]*?)<\/reasoning>/gi,
    /<antThinking>([\s\S]*?)<\/antThinking>/gi,
    /<internal_monologue>([\s\S]*?)<\/internal_monologue>/gi,
    /<reflection>([\s\S]*?)<\/reflection>/gi,
    /<thought>([\s\S]*?)<\/thought>/gi,
  ];

  let thinkingContent = '';
  let visibleContent = content;

  for (const pattern of thinkingPatterns) {
    visibleContent = visibleContent.replace(pattern, (_match, captured: string) => {
      thinkingContent += (thinkingContent ? '\n\n' : '') + captured.trim();
      return '';
    });
  }

  return {
    visibleContent: visibleContent.trim(),
    thinkingContent: thinkingContent || null,
  };
}

/**
 * Parse markdown segments for rendering.
 * Lightweight — only handles common chat formatting.
 */
export function parseMarkdownSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  // Split by code blocks first
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      segments.push(...parseInlineSegments(text.slice(lastIndex, match.index)));
    }
    segments.push({
      type: 'codeBlock',
      content: match[2].trim(),
      language: match[1] || undefined,
    });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push(...parseInlineSegments(text.slice(lastIndex)));
  }

  return segments;
}

function parseInlineSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      segments.push({ type: 'bold', content: match[2] });
    } else if (match[3]) {
      segments.push({ type: 'italic', content: match[3] });
    } else if (match[4]) {
      segments.push({ type: 'code', content: match[4] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
