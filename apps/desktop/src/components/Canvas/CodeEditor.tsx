/**
 * CodeEditor
 *
 * A lightweight code editor using a styled textarea with:
 * - Tab key inserts 2 spaces
 * - Language label shown top-right
 * - Copy code button
 * - Run button for executable languages
 */

import { Check, Copy, Play } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

const EXECUTABLE_LANGUAGES = new Set(['python', 'python3', 'javascript', 'js', 'bash', 'sh']);

interface CodeEditorProps {
  content: string;
  language?: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  isRunning?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function CodeEditor({
  content,
  language,
  onChange,
  onRun,
  isRunning = false,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = content.split('\n').length;
  const isExecutable = language ? EXECUTABLE_LANGUAGES.has(language.toLowerCase()) : false;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Copied to clipboard');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy code');
    }
  }, [content]);

  const handleTab = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();

      const textarea = textareaRef.current;
      if (!textarea || readOnly) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = content.slice(0, start) + '  ' + content.slice(end);
      onChange(newValue);

      // Restore cursor position after React updates the value
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = start + 2;
      });
    },
    [content, onChange, readOnly],
  );

  const displayLang = language ?? 'text';

  return (
    <div className={cn('relative flex flex-col h-full bg-gray-950 rounded-b-lg', className)}>
      {/* Editor toolbar */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 bg-gray-900 rounded-t-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
            {displayLang}
          </span>
          <span className="text-xs text-gray-600">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isExecutable && onRun && (
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                isRunning
                  ? 'bg-green-500/20 text-green-400 cursor-not-allowed'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
              )}
              title="Run code"
            >
              <Play className={cn('h-3 w-3', isRunning && 'animate-pulse')} />
              {isRunning ? 'Running...' : 'Run'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Line numbers + textarea */}
      <div className="flex flex-1 overflow-auto">
        {/* Line numbers */}
        <div
          aria-hidden="true"
          className="select-none min-w-[3rem] bg-gray-950 text-gray-600 font-mono text-sm leading-6 px-2 pt-4 text-right border-r border-white/5 shrink-0"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleTab}
          spellCheck={false}
          readOnly={readOnly}
          className={cn(
            'flex-1 font-mono text-sm text-gray-100 bg-gray-950 p-4 resize-none outline-none leading-6 w-full',
            readOnly && 'cursor-default',
          )}
          style={{ tabSize: 2 }}
          aria-label="Code editor"
          aria-multiline="true"
        />
      </div>
    </div>
  );
}
