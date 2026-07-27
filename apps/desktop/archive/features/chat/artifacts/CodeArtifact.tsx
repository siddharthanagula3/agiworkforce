import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Artifact } from '../../../types/chat';

export function CodeArtifact({
  artifact,
  isDark: _isDark,
}: {
  artifact: Artifact;
  isDark: boolean;
}) {
  const lineCount = artifact.content.split('\n').length;

  return (
    <div className="overflow-x-auto bg-background">
      <SyntaxHighlighter
        language={artifact.language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
        showLineNumbers={lineCount > 3}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#4b5563',
          userSelect: 'none',
        }}
        wrapLongLines={false}
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  );
}
