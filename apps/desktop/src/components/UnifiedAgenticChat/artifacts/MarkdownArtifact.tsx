import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../../lib/utils';
import type { Artifact } from '../../../types/chat';

export function MarkdownArtifact({ artifact, isDark }: { artifact: Artifact; isDark: boolean }) {
  return (
    <div
      className={cn(
        'p-4 overflow-auto max-h-[600px]',
        'prose prose-sm max-w-none',
        isDark ? 'prose-invert prose-zinc' : 'prose-zinc',
        '[&_pre]:bg-card [&_pre]:rounded [&_pre]:overflow-x-auto',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:w-full [&_table]:text-sm',
        '[&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:px-3 [&_th]:py-2',
        '[&_td]:px-3 [&_td]:py-2 [&_td]:border-b',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic',
        '[&_a]:text-blue-400 [&_a]:underline',
        '[&_hr]:border-border',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
    </div>
  );
}
