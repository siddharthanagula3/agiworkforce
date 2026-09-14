import * as Tooltip from '@radix-ui/react-tooltip';
import { FileText } from 'lucide-react';
import {
  formatProjectFileAnchor,
  projectFileCitationKey,
  type ProjectFileCitation,
} from '@agiworkforce/types';
import { cn } from '../../lib/utils';

/**
 * Where the reader goes to check the claim: the project's knowledge panel, with
 * the cited file open at the page the passage came from. Absent when the turn
 * did not carry an id for either, in which case the chip is not a link.
 */
function citationHref(citation: ProjectFileCitation): string | undefined {
  if (!citation.projectId || !citation.fileId) return undefined;
  const params = new URLSearchParams({ knowledgeFile: citation.fileId });
  if (typeof citation.anchor?.page === 'number') params.set('page', String(citation.anchor.page));
  return `/chat/projects/${encodeURIComponent(citation.projectId)}?${params.toString()}`;
}

function ChipBody({
  citation,
  location,
}: {
  citation: ProjectFileCitation;
  location: string | null;
}) {
  return (
    <>
      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <span className="truncate">{citation.fileName}</span>
      {location && (
        <>
          <span aria-hidden="true" className="shrink-0 text-[var(--chat-text-muted)]">
            &middot;
          </span>
          <span className="shrink-0 whitespace-nowrap">{location}</span>
        </>
      )}
    </>
  );
}

function ProjectFileChip({ citation }: { citation: ProjectFileCitation }) {
  const location = formatProjectFileAnchor(citation.anchor);
  const href = citationHref(citation);
  const label = location
    ? `Project file ${citation.fileName}, ${location}`
    : `Project file ${citation.fileName}`;
  const chipClassName = cn(
    'inline-flex h-7 max-w-[16rem] items-center gap-1 align-middle',
    'rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]',
    'px-2.5 text-xs font-medium text-[var(--chat-text-secondary)] no-underline',
    'transition-colors duration-100 hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)]',
  );

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        {href ? (
          <a href={href} aria-label={label} className={chipClassName}>
            <ChipBody citation={citation} location={location} />
          </a>
        ) : (
          <span role="note" aria-label={label} className={chipClassName}>
            <ChipBody citation={citation} location={location} />
          </span>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className={cn(
            'z-50 flex max-w-[320px] flex-col gap-1 rounded-lg border px-3 py-2 text-xs',
            'bg-[var(--chat-surface-overlay)] text-[var(--chat-text-primary)]',
            'border-[var(--chat-border)] shadow-[var(--chat-shadow-lg)]',
          )}
        >
          <span className="block truncate font-medium">{citation.fileName}</span>
          {location && <span className="block text-[var(--chat-text-secondary)]">{location}</span>}
          {citation.snippet && (
            <span
              className="block text-[var(--chat-text-secondary)]"
              data-project-citation-snippet=""
            >
              {citation.snippet}
            </span>
          )}
          <Tooltip.Arrow className="fill-[var(--chat-surface-overlay)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * A turn is given every passage that fit its budget, which for one long file is
 * a run of adjacent pages. The place the answer actually named leads the row,
 * so the chip a reader wants is the first one rather than the seventh.
 */
function orderByAnswer(
  citations: readonly ProjectFileCitation[],
  answerText: string,
): readonly ProjectFileCitation[] {
  if (!answerText) return citations;
  const named = (citation: ProjectFileCitation): boolean => {
    const location = formatProjectFileAnchor(citation.anchor);
    return Boolean(location && answerText.includes(location));
  };
  const cited = citations.filter(named);
  return cited.length === 0 || cited.length === citations.length
    ? citations
    : [...cited, ...citations.filter((citation) => !named(citation))];
}

/** The project files an answer drew on, one chip per place inside a file. */
export function ProjectFileCitations({
  citations,
  answerText = '',
}: {
  citations: readonly ProjectFileCitation[];
  answerText?: string;
}) {
  const ordered = orderByAnswer(citations, answerText);
  if (ordered.length === 0) return null;

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <div
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Project files used in this answer"
      >
        {ordered.map((citation) => (
          <ProjectFileChip key={projectFileCitationKey(citation)} citation={citation} />
        ))}
      </div>
    </Tooltip.Provider>
  );
}
