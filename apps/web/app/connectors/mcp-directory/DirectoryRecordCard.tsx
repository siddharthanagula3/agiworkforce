import Link from 'next/link';

import { Prose } from '@/features/marketing/components/system';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { DirectoryCardIcon } from './DirectoryCardIcon';
import { BADGE_LABELS, directoryRecordPath } from './directory-public';

function iconHref(record: DirectoryRecord): string | null {
  return record.iconUrl
    ? `/api/connectors/directory/icon?id=${encodeURIComponent(record.id)}`
    : null;
}

function toolCount(record: DirectoryRecord): string | null {
  const count = record.toolNames.length;
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

export function DirectoryRecordCard({ record }: { record: DirectoryRecord }) {
  const icon = iconHref(record);
  const tools = toolCount(record);
  const description = record.description.trim();

  return (
    <li className="agi-ds-card">
      <div className="flex items-start gap-3">
        {icon ? (
          <DirectoryCardIcon src={icon} monogram={record.monogram} />
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-sm font-medium text-foreground"
          >
            {record.monogram}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="agi-ds-h3 line-clamp-2" title={record.name}>
            <Link href={directoryRecordPath(record.id)} prefetch={false} className="agi-ds-link">
              {record.name}
            </Link>
          </h3>
          <Prose size="sm">
            <span className="rounded-full border border-border px-2 py-0.5">
              {BADGE_LABELS[record.badge]}
            </span>{' '}
            {record.publisher}
            {tools ? ` · ${tools}` : ''}
          </Prose>
        </div>
      </div>
      {description ? <Prose className="line-clamp-3">{description}</Prose> : null}
    </li>
  );
}
