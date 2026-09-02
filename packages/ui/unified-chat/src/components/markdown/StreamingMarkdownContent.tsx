import React, { useMemo, useRef } from 'react';

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

  const tail = isStreaming ? completeInlineTokens(view.tail) : view.tail;

  return (
    <>
      {view.settled.map((block) => (
        <React.Fragment key={block.key}>
          <MarkdownContent content={block.source} skipPreprocess citations={citations} />
          {UNIT_SEPARATOR}
        </React.Fragment>
      ))}
      <MarkdownContent
        content={tail}
        isStreaming={isStreaming}
        skipPreprocess
        citations={citations}
      />
    </>
  );
}

export const StreamingMarkdownContent = React.memo(StreamingMarkdownContentImpl);
StreamingMarkdownContent.displayName = 'StreamingMarkdownContent';
