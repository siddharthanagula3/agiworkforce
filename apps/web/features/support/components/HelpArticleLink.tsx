import { CircleHelp } from 'lucide-react';
import { helpArticlePath } from '@/lib/support/help-paths';

export function HelpArticleLink({ docId, label }: { docId: string; label: string }) {
  return (
    <a
      href={helpArticlePath(docId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline pointer-coarse:min-h-11"
    >
      <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </a>
  );
}
