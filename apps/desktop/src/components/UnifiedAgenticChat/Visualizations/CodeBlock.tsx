import React, { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, Maximize2, WrapText, Terminal } from 'lucide-react';
import { toast } from 'sonner';

// Language icons and colors mapping
const LANGUAGE_CONFIG: Record<string, { color: string; icon?: string }> = {
  javascript: { color: '#f7df1e', icon: 'JS' },
  typescript: { color: '#3178c6', icon: 'TS' },
  python: { color: '#3776ab', icon: 'PY' },
  rust: { color: '#ce422b', icon: 'RS' },
  go: { color: '#00add8', icon: 'GO' },
  java: { color: '#ed8b00', icon: 'JV' },
  cpp: { color: '#00599c', icon: 'C++' },
  c: { color: '#a8b9cc', icon: 'C' },
  ruby: { color: '#cc342d', icon: 'RB' },
  php: { color: '#777bb4', icon: 'PHP' },
  swift: { color: '#fa7343', icon: 'SW' },
  kotlin: { color: '#7f52ff', icon: 'KT' },
  html: { color: '#e34f26', icon: 'HTML' },
  css: { color: '#1572b6', icon: 'CSS' },
  scss: { color: '#cc6699', icon: 'SCSS' },
  json: { color: '#292929', icon: '{ }' },
  yaml: { color: '#cb171e', icon: 'YML' },
  markdown: { color: '#083fa1', icon: 'MD' },
  sql: { color: '#e38c00', icon: 'SQL' },
  bash: { color: '#4eaa25', icon: '$' },
  shell: { color: '#4eaa25', icon: '$' },
  sh: { color: '#4eaa25', icon: '$' },
  powershell: { color: '#5391fe', icon: 'PS' },
  dockerfile: { color: '#2496ed', icon: '🐳' },
  graphql: { color: '#e10098', icon: 'GQL' },
  text: { color: '#6b7280' },
};

export interface CodeBlockProps {
  code: string;
  language: string;
  fileName?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  theme?: 'dark' | 'light';
  enableCopy?: boolean;
  enableDownload?: boolean;
  enableRun?: boolean;
  onRun?: (code: string) => void;
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
  enableRun = false,
  onRun,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  const langConfig = useMemo(() => {
    const normalizedLang = language.toLowerCase();
    return LANGUAGE_CONFIG[normalizedLang] || { color: '#6b7280' };
  }, [language]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard', {
        icon: <Check className="h-4 w-4" />,
        duration: 2000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
      toast.error('Failed to copy code');
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
    toast.success('Code downloaded');
  };

  const handleRun = () => {
    if (onRun) {
      onRun(code);
      toast.success('Running code...');
    }
  };

  const codeStyle = theme === 'dark' ? vscDarkPlus : vs;

  return (
    <div
      className={`code-block relative rounded-lg overflow-hidden border border-gray-700 ${className}`}
    >
      {}
      <div className="flex items-center justify-between bg-gray-800/80 backdrop-blur-xs px-3 py-2 text-sm border-b border-gray-700">
        <div className="flex items-center gap-2">
          {/* Language badge with color indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ backgroundColor: `${langConfig.color}20`, color: langConfig.color }}
          >
            {langConfig.icon && <span className="font-mono text-[10px]">{langConfig.icon}</span>}
            <span className="uppercase">{language}</span>
          </div>
          {fileName && (
            <span
              className="text-gray-400 font-mono text-xs truncate max-w-[150px]"
              title={fileName}
            >
              {fileName}
            </span>
          )}
          {/* Line count */}
          <span className="text-gray-500 text-[10px]">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Word wrap toggle */}
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`p-1.5 rounded transition-colors ${wordWrap ? 'bg-gray-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          >
            <WrapText size={14} />
          </button>
          {enableRun && onRun && (
            <button
              onClick={handleRun}
              className="p-1.5 hover:bg-green-600/20 rounded transition-colors text-green-400"
              title="Run code"
            >
              <Terminal size={14} />
            </button>
          )}
          {enableDownload && (
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
              title="Download"
            >
              <Download size={14} />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 rounded transition-colors ${isExpanded ? 'bg-gray-600 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'}`}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Maximize2 size={14} />
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
                <Copy size={14} className="text-gray-400 hover:text-gray-200" />
              )}
            </button>
          )}
        </div>
      </div>

      {}
      <div className={`overflow-auto ${isExpanded ? 'max-h-[80vh]' : 'max-h-96'}`}>
        {}
        <SyntaxHighlighter
          language={language}
          style={codeStyle}
          showLineNumbers={showLineNumbers}
          wrapLines={true}
          wrapLongLines={wordWrap}
          lineProps={(lineNumber) => {
            const style: React.CSSProperties = {};
            if (highlightLines.includes(lineNumber)) {
              style.backgroundColor = 'rgba(255, 255, 0, 0.15)';
              style.borderLeft = '3px solid #fbbf24';
              style.marginLeft = '-3px';
            }
            return { style };
          }}
          lineNumberStyle={{
            minWidth: '3em',
            paddingRight: '1em',
            color: theme === 'dark' ? '#6b7280' : '#9ca3af',
            userSelect: 'none',
            fontSize: '0.75rem',
          }}
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            background: theme === 'dark' ? '#0d1117' : '#ffffff',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default CodeBlock;
