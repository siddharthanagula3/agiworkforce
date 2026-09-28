import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { Eyebrow, Ledger, Prose, Stack } from '@/features/marketing/components/system';
import type { PolicyBlock, PolicySegment } from '@/lib/legal/policy-archive';

function segmentNode(segment: PolicySegment, key: number): ReactNode {
  if (segment.text === '\n') return <br key={key} />;
  let node: ReactNode = segment.text;
  if (segment.code) node = <code>{node}</code>;
  if (segment.em) node = <em>{node}</em>;
  if (segment.strong) node = <strong>{node}</strong>;
  if (segment.href?.startsWith('/')) {
    return (
      <Link key={key} href={segment.href} className="agi-ds-link">
        {node}
      </Link>
    );
  }
  if (segment.href) {
    return (
      <a key={key} href={segment.href} className="agi-ds-link">
        {node}
      </a>
    );
  }
  return <Fragment key={key}>{node}</Fragment>;
}

function Segments({ segments }: { segments: readonly PolicySegment[] }) {
  return <>{segments.map(segmentNode)}</>;
}

function ArchivedBlock({ block }: { block: PolicyBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level <= 2 ? (
        <h2 className="agi-ds-h2" id={block.anchor}>
          <Segments segments={block.content} />
        </h2>
      ) : (
        <h3 className="agi-ds-h3" id={block.anchor}>
          <Segments segments={block.content} />
        </h3>
      );
    case 'paragraph':
      return (
        <Prose>
          <Segments segments={block.content} />
        </Prose>
      );
    case 'eyebrow':
      return (
        <Eyebrow>
          <Segments segments={block.content} />
        </Eyebrow>
      );
    case 'list':
      return (
        <ul className="agi-ds-prose flex list-disc flex-col gap-2 ps-6">
          {block.items.map((item, index) => (
            <li key={index}>
              <Segments segments={item} />
            </li>
          ))}
        </ul>
      );
    case 'rows':
      return (
        <Ledger
          {...(block.caption ? { caption: block.caption } : {})}
          rows={block.rows.map((row) => ({
            label: <Segments segments={row.label} />,
            value: <Segments segments={row.value} />,
          }))}
        />
      );
    case 'table':
      return (
        <Ledger
          rows={block.rows.map((cells) => ({
            label: <Segments segments={cells[0] ?? []} />,
            value: (
              <>
                {cells.slice(1).map((cell, index) => (
                  <span key={index} className="block">
                    {block.header[index + 1] ? `${block.header[index + 1]}: ` : null}
                    <Segments segments={cell} />
                  </span>
                ))}
              </>
            ),
          }))}
        />
      );
  }
}

export function ArchivedPolicyBody({ blocks }: { blocks: readonly PolicyBlock[] }) {
  const titleAt = blocks.findIndex((block) => block.type === 'heading' && block.level === 1);
  return (
    <Stack gap="loose">
      {blocks.slice(titleAt + 1).map((block, index) => (
        <ArchivedBlock key={index} block={block} />
      ))}
    </Stack>
  );
}
