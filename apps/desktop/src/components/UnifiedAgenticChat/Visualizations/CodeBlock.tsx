import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, Maximize2 } from 'lucide-react';

export interface CodeBlockProps {
  code: string;
  language: string;
  fileName?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  theme?: 'dark' | 'light';
  enableCopy?: boolean;
  enableDownload?: boolean;
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  fileName,
  showLineNumbers = true,
  highlightLines = [],
  theme = 'dark',
  enableCopy = true,
  enableDownload = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `code.${language}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const codeStyle = theme === 'dark' ? vscDarkPlus : vs;

  return (
    <div className={`code-block relative rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          {fileName && <span className="text-gray-300 font-mono text-xs">{fileName}</span>}
          <span className="text-gray-400 text-xs uppercase">{language}</span>
        </div>
        <div className="flex items-center gap-2">
          {enableDownload && (
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Download"
            >
              <Download size={14} className="text-gray-300" />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Maximize2 size={14} className="text-gray-300" />
          </button>
          {enableCopy && (
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Copy code"
            >
              {copied ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} className="text-gray-300" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Code Content */}
      <div className={`overflow-auto ${isExpanded ? 'max-h-[80vh]' : 'max-h-96'}`}>
        {/* @ts-expect-error - SyntaxHighlighter type incompatibility with React 18 */}
        <SyntaxHighlighter
          language={language}
          style={codeStyle}
          showLineNumbers={showLineNumbers}
          wrapLines={true}
          lineProps={(lineNumber) => {
            const style: React.CSSProperties = {};
            if (highlightLines.includes(lineNumber)) {
              style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
            }
            return { style };
          }}
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.875rem',
            background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default CodeBlock;
