import React, { useState } from 'react';
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
      setTimeout(() => setCopied(false), 2000);
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
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderOutput = (output: string, isError: boolean = false) => {
    if (!output) return null;

    const lines = output.split('\n').slice(0, maxLines);
    const filteredLines = searchQuery
      ? lines.filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
      : lines;

    return (
      <div className={`font-mono text-sm ${isError ? 'text-red-400' : 'text-gray-200'}`}>
        {filteredLines.map((line, index) => (
          <div
            key={index}
            className={`${wrapLines ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'} px-3 py-0.5 hover:bg-gray-800/50`}
          >
            {ansiEnabled ? <Ansi>{line}</Ansi> : line}
          </div>
        ))}
        {lines.length > maxLines && (
          <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700">
            Output truncated. Showing first {maxLines} of {lines.length} lines.
          </div>
        )}
      </div>
    );
  };

  const stdoutLines = stdout.split('\n').length;
  const stderrLines = stderr.split('\n').length;

  return (
    <div className={`terminal-output-viewer rounded-lg overflow-hidden bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-200">Terminal Output</span>
          <div className="flex items-center gap-2">
            {stdout && (
              <button
                onClick={() => setShowStdout(!showStdout)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showStdout ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-400'
                }`}
              >
                stdout ({stdoutLines})
              </button>
            )}
            {stderr && (
              <button
                onClick={() => setShowStderr(!showStderr)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showStderr ? 'bg-red-900/50 text-red-300' : 'bg-gray-700 text-gray-400'
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
              onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Search output"
            >
              <Search size={14} className="text-gray-400" />
            </button>
          )}
          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded transition-colors ${
              wrapLines ? 'bg-gray-700 text-gray-200' : 'text-gray-400 hover:bg-gray-700'
            }`}
            title="Wrap lines"
          >
            <WrapText size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Copy output"
          >
            <Copy size={14} className={copied ? 'text-green-400' : 'text-gray-400'} />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Download output"
          >
            <Download size={14} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in output..."
            className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>
      )}

      {/* Output Content */}
      <div className="overflow-auto max-h-96">
        {showStdout && stdout && (
          <div className="border-b border-gray-800">{renderOutput(stdout, false)}</div>
        )}
        {showStderr && stderr && <div>{renderOutput(stderr, true)}</div>}
        {!stdout && !stderr && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">No output</div>
        )}
      </div>
    </div>
  );
};

export default TerminalOutputViewer;
