import React, { useEffect, useRef, useState } from 'react';
import Ansi from 'ansi-to-react';
import { Search, Copy, Download, WrapText } from 'lucide-react';

export interface TerminalOutputViewerProps {
  stdout: string;
  stderr: string;
  ansiEnabled?: boolean;
  maxLines?: number;
  searchable?: boolean;
  className?: string;
}

export const TerminalOutputViewer: React.FC<TerminalOutputViewerProps> = ({
  stdout,
  stderr,
  ansiEnabled = true,
  maxLines = 1000,
  searchable = true,
  className = '',
}) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wrapLines, setWrapLines] = useState(false);
  const [showStdout, setShowStdout] = useState(true);
  const [showStderr, setShowStderr] = useState(true);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const content = [
      showStdout && stdout ? `STDOUT:\n${stdout}` : '',
      showStderr && stderr ? `STDERR:\n${stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy output:', err);
    }
  };

  const handleDownload = () => {
    const content = [
      showStdout && stdout ? `STDOUT:\n${stdout}` : '',
      showStderr && stderr ? `STDERR:\n${stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-output-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderOutput = (output: string, isError: boolean = false) => {
    if (!output) return null;

    const lines = output.split('\n').slice(0, maxLines);
    const filteredLines = searchQuery
      ? lines.filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
      : lines;

    return (
      <div className={`font-mono text-sm ${isError ? 'text-red-400' : 'text-foreground'}`}>
        {filteredLines.map((line, index) => (
          <div
            key={index}
            className={`${wrapLines ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'} px-3 py-0.5 hover:bg-muted/50`}
          >
            {ansiEnabled ? <Ansi>{line}</Ansi> : line}
          </div>
        ))}
        {lines.length > maxLines && (
          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
            Output truncated. Showing first {maxLines} of {lines.length} lines.
          </div>
        )}
      </div>
    );
  };

  const stdoutLines = stdout.split('\n').length;
  const stderrLines = stderr.split('\n').length;

  return (
    <div className={`terminal-output-viewer rounded-lg overflow-hidden bg-card ${className}`}>
      {}
      <div className="flex items-center justify-between bg-muted px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Terminal Output</span>
          <div className="flex items-center gap-2">
            {stdout && (
              <button
                type="button"
                onClick={() => setShowStdout(!showStdout)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showStdout ? 'bg-green-900/50 text-green-300' : 'bg-accent text-muted-foreground'
                }`}
              >
                stdout ({stdoutLines})
              </button>
            )}
            {stderr && (
              <button
                type="button"
                onClick={() => setShowStderr(!showStderr)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showStderr ? 'bg-red-900/50 text-red-300' : 'bg-accent text-muted-foreground'
                }`}
              >
                stderr ({stderrLines})
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {searchable && (
            <button
              type="button"
              onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Search output"
            >
              <Search size={14} className="text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded transition-colors ${
              wrapLines ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
            title="Wrap lines"
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Copy output"
          >
            <Copy size={14} className={copied ? 'text-green-400' : 'text-muted-foreground'} />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Download output"
          >
            <Download size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {}
      {showSearch && (
        <div className="px-4 py-2 bg-muted border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in output..."
            className="w-full px-3 py-1.5 bg-card border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>
      )}

      {}
      <div className="overflow-auto max-h-96">
        {showStdout && stdout && (
          <div className="border-b border-border">{renderOutput(stdout, false)}</div>
        )}
        {showStderr && stderr && <div>{renderOutput(stderr, true)}</div>}
        {!stdout && !stderr && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">No output</div>
        )}
      </div>
    </div>
  );
};

export default TerminalOutputViewer;
