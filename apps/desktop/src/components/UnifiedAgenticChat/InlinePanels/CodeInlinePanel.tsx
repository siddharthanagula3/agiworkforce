/**
 * CodeInlinePanel Component
 *
 * Displays code files inline with syntax highlighting, diff viewer,
 * and file information.
 */

import React, { memo } from 'react';
import { Copy, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { InlinePanel as InlinePanelType } from '../../../stores/unifiedChatStore';
import { InlinePanel } from './InlinePanel';

export interface CodeInlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  messageId?: string;
}

const CodeInlinePanelComponent: React.FC<CodeInlinePanelProps> = memo(
  ({ panel, onToggleCollapse }) => {
    const codeContent = panel.content.code;

    if (!codeContent) {
      return null;
    }

    const handleCopyCode = () => {
      navigator.clipboard.writeText(codeContent.content);
      toast.success('Code copied to clipboard');
    };

    // Determine language from extension or metadata
    const getLanguageDisplay = () => {
      if (codeContent.language) {
        return codeContent.language.toUpperCase();
      }
      const ext = codeContent.filePath.split('.').pop()?.toUpperCase() || 'TEXT';
      return ext;
    };

    // Highlight lines for diff if available
    const lines = codeContent.content.split('\n');

    return (
      <InlinePanel panel={panel} onToggleCollapse={onToggleCollapse} onClose={() => {}}>
        <div className="space-y-3">
          {/* File Path and Language */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-gray-500 flex-shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    File
                  </div>
                  <div className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                    {codeContent.filePath}
                  </div>
                </div>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors text-gray-600 dark:text-gray-400 flex-shrink-0 ml-2"
                title="Copy code"
              >
                <Copy size={12} />
              </button>
            </div>

            {/* Language Badge */}
            <div className="flex gap-2">
              <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded">
                {getLanguageDisplay()}
              </span>
              {codeContent.isModified && (
                <span className="inline-block px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded">
                  Modified
                </span>
              )}
            </div>
          </div>

          {/* Code Block */}
          <div>
            <div className="bg-gray-900 dark:bg-black rounded border border-gray-700 dark:border-gray-800 overflow-hidden">
              <div className="font-mono text-sm text-gray-100 max-h-96 overflow-y-auto">
                <table className="w-full">
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-gray-800 dark:hover:bg-gray-800/50">
                        <td className="select-none w-12 pr-4 text-right text-gray-600 bg-gray-950 dark:bg-black/50 text-xs leading-6 py-0">
                          {idx + 1}
                        </td>
                        <td className="pl-4 text-xs leading-6 py-0 whitespace-pre-wrap break-words">
                          {line || ' '}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Line Count */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </div>
          </div>

          {/* Diff Info */}
          {codeContent.diff && (
            <div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-2">
                Changes
              </span>
              <div className="bg-gray-900 dark:bg-black rounded border border-gray-700 dark:border-gray-800 p-3 font-mono text-xs text-gray-100 max-h-48 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words">{codeContent.diff}</pre>
              </div>
            </div>
          )}
        </div>
      </InlinePanel>
    );
  },
);

CodeInlinePanelComponent.displayName = 'CodeInlinePanel';

export { CodeInlinePanelComponent as CodeInlinePanel };
