import { useMemo, useState } from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { Separator } from '../ui/Separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArtifactRenderer } from './ArtifactRenderer';
import { FileAttachmentPreview } from './FileAttachmentPreview';
import type { Artifact, FileAttachment } from '../../types/chat';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number | undefined;
  cost?: number | undefined;
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
}

interface MessageProps {
  message: Message;
}

export function Message({ message }: MessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const avatar = useMemo(() => {
    if (isUser) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Bot className="h-4 w-4" />
      </div>
    );
  }, [isUser]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="text-xs text-muted-foreground px-4 py-1 rounded-full bg-muted/50">
          {message.content}
        </div>
      </div>
    );
  }

  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasArtifacts = message.artifacts && message.artifacts.length > 0;

  return (
    <div
      className={cn(
        'group relative flex gap-3 px-4 py-4',
        'hover:bg-accent/50 transition-colors',
        isUser && 'bg-muted/30'
      )}
    >
      {avatar}

      <div className="flex-1 space-y-3 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>

        {/* File Attachments */}
        {hasAttachments && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {message.attachments!.map((attachment) => (
                <FileAttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  removable={false}
                />
              ))}
            </div>
            {message.content && <Separator className="my-2" />}
          </div>
        )}

        {/* Message Content */}
        {message.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { children, className, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <SyntaxHighlighter
                      style={oneDark as SyntaxHighlighterProps['style']}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...rest}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Artifacts */}
        {hasArtifacts && (
          <div className="space-y-3">
            {message.content && <Separator className="my-2" />}
            {message.artifacts!.map((artifact) => (
              <ArtifactRenderer key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}

        {/* Token and cost info */}
        {(message.tokens || message.cost) && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {message.tokens && <span>{message.tokens} tokens</span>}
            {message.cost && <span>${message.cost.toFixed(4)}</span>}
          </div>
        )}
      </div>

      {/* Copy button */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? 'Copied!' : 'Copy message'}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
