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

    // Reference links and footnotes are document-scoped, so a block that settled
    // before its definition arrived can never resolve it. Once one exists the
    // message renders as one unit until the content stops being an append.
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
