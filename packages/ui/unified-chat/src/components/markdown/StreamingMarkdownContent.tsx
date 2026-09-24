import React, { useMemo, useRef } from 'react';

import { StreamAnnouncer } from './StreamAnnouncer';
import { MarkdownContent } from './MarkdownContent';
import { completeInlineTokens } from './completeInlineTokens';
import { preprocessMath } from './preprocessMath';
import type { MarkdownCitation } from './CitationChip';
import {
  createMarkdownBlockSplitter,
  type MarkdownBlockSplitter,
  type SettledMarkdownBlock,
} from './splitMarkdownBlocks';

const NO_SETTLED_BLOCKS: readonly SettledMarkdownBlock[] = Object.freeze([]);

// mdast-util-to-hast separates root children with a newline text node. Rendering
// a block on its own loses the one that followed it, so each unit boundary has
// to put it back or the streamed DOM stops matching a single full parse.
const UNIT_SEPARATOR = '\n';

// A reference link `[text][label]` or footnote `[^label]` resolves against a
// definition that can stream in anywhere in the document, so a settled block
// that used one before its definition arrived can never resolve it once
// rendered on its own. This reads the labels still waiting, unsettled, in the
// tail so the caller can check whether any already-settled block named one -
// most settled prose never does, so it does not need to be reconsidered.
const DEFINITION_LABEL_PATTERN = /^ {0,3}\[(\^?[^\]\n]+)\]:/gm;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const DELIMITER_PREFIX_PATTERN = /^[|:\-\s]+$/;
const DELIMITER_CELL_PATTERN = /^:?-+:?$/;

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
    escaped = character === '\\' ? !escaped : false;
  }
  cells.push(cell.trim());
  return cells;
}

function hasUnescapedPipe(line: string): boolean {
  let escaped = false;
  for (const character of line) {
    if (character === '|' && !escaped) return true;
    escaped = character === '\\' ? !escaped : false;
  }
  return false;
}

function lineStartsInsideFence(lines: readonly string[], index: number): boolean {
  let fence: { marker: string; length: number } | null = null;
  for (let position = 0; position < index; position += 1) {
    const match = FENCE_PATTERN.exec(lines[position] ?? '');
    if (!match?.[1]) continue;
    const run = match[1];
    if (!fence) {
      fence = { marker: run[0]!, length: run.length };
    } else if (run[0] === fence.marker && run.length >= fence.length) {
      fence = null;
    }
  }
  return fence !== null;
}

export function holdIncompleteGfmTable(source: string): string {
  if (!source.includes('|')) return source;
  const lines = source.split('\n');
  let last = lines.length - 1;
  if (source.endsWith('\n')) last -= 1;
  if (last < 0 || !lines[last]?.trim()) return source;

  const lastLine = lines[last]!;
  const lastStart = lines.slice(0, last).reduce((length, line) => length + line.length + 1, 0);
  if (lineStartsInsideFence(lines, last)) return source;

  if (hasUnescapedPipe(lastLine) && !DELIMITER_PREFIX_PATTERN.test(lastLine.trim())) {
    return source.slice(0, lastStart);
  }

  if (last === 0 || !DELIMITER_PREFIX_PATTERN.test(lastLine.trim())) return source;
  const header = lines[last - 1]!;
  if (!hasUnescapedPipe(header) || lineStartsInsideFence(lines, last - 1)) return source;
  const headerCells = splitTableCells(header);
  const delimiterCells = splitTableCells(lastLine);
  const complete =
    headerCells.length === delimiterCells.length &&
    delimiterCells.length > 1 &&
    delimiterCells.every((cell) => DELIMITER_CELL_PATTERN.test(cell));
  if (complete) return source;
  const headerStart = lastStart - header.length - 1;
  return source.slice(0, Math.max(0, headerStart));
}

function referenceDefinitionTokens(tail: string): readonly string[] {
  const tokens: string[] = [];
  for (const match of tail.matchAll(DEFINITION_LABEL_PATTERN)) {
    const label = match[1];
    if (label) tokens.push(`[${label}]`);
  }
  return tokens;
}

function settledBlockUsesAnyToken(
  settled: readonly SettledMarkdownBlock[],
  tokens: readonly string[],
): boolean {
  return settled.some((block) => {
    const lower = block.source.toLowerCase();
    return tokens.some((token) => lower.includes(token.toLowerCase()));
  });
}

interface StreamingView {
  readonly settled: readonly SettledMarkdownBlock[];
  readonly tail: string;
}

export interface StreamingMarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  citations?: readonly MarkdownCitation[];
}

function StreamingMarkdownContentImpl({
  content,
  isStreaming = true,
  citations,
}: StreamingMarkdownContentProps) {
  const splitterRef = useRef<MarkdownBlockSplitter | null>(null);
  const singleUnitFromRef = useRef<string | null>(null);

  const view = useMemo<StreamingView>(() => {
    const source = preprocessMath(content);

    const singleUnitFrom = singleUnitFromRef.current;
    if (singleUnitFrom !== null && source.startsWith(singleUnitFrom)) {
      return { settled: NO_SETTLED_BLOCKS, tail: source };
    }
    singleUnitFromRef.current = null;

    splitterRef.current ??= createMarkdownBlockSplitter();
    const split = splitterRef.current.update(source);
    if (!split.hasReferenceDefinition) return { settled: split.settled, tail: split.tail };

    const tokens = referenceDefinitionTokens(split.tail);
    if (tokens.length > 0 && !settledBlockUsesAnyToken(split.settled, tokens)) {
      // The unresolved definition's own block still holds back the tail, but
      // nothing already settled names its label, so none of it needs
      // reconsidering - splitting stays bounded to the unresolved remainder.
      return { settled: split.settled, tail: split.tail };
    }

    // An already-settled block names a label this definition could resolve
    // (or the label could not be read back out of the tail at all), so
    // nothing settled so far can be trusted on its own. Fold the whole
    // message into one unit until the content stops being an append of it.
    splitterRef.current.reset();
    singleUnitFromRef.current = source;
    return { settled: NO_SETTLED_BLOCKS, tail: source };
  }, [content]);

  const tail = isStreaming ? completeInlineTokens(holdIncompleteGfmTable(view.tail)) : view.tail;

  return (
    <StreamAnnouncer text={content} isStreaming={isStreaming}>
      {view.settled.map((block) => (
        <React.Fragment key={block.key}>
          <MarkdownContent
            content={block.source}
            skipPreprocess
            citations={citations}
            linkifyNumericCitations={!isStreaming}
          />
          {UNIT_SEPARATOR}
        </React.Fragment>
      ))}
      <MarkdownContent
        content={tail}
        isStreaming={isStreaming}
        skipPreprocess
        citations={citations}
        linkifyNumericCitations={!isStreaming}
      />
    </StreamAnnouncer>
  );
}

export const StreamingMarkdownContent = React.memo(StreamingMarkdownContentImpl);
StreamingMarkdownContent.displayName = 'StreamingMarkdownContent';
