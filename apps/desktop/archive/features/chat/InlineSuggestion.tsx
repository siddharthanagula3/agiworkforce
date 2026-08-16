
import React from 'react';

export interface InlineSuggestionProps {
  content: string;
  suggestion: string;
  isLoading: boolean;
}

export const InlineSuggestion: React.FC<InlineSuggestionProps> = ({
  content,
  suggestion,
  isLoading,
}) => {
  if (!suggestion && !isLoading) {
    return null;
  }

  return (
    <div
      className="absolute top-2 left-2 text-[15px] leading-6 text-muted-foreground pointer-events-none"
      style={{
        paddingLeft: '8px',
        paddingRight: '8px',
      }}
      aria-hidden="true"
    >
      <span className="invisible">{content}</span>
      {isLoading ? (
        <span className="text-muted-foreground animate-pulse">...</span>
      ) : (
        <span className="italic">{suggestion}</span>
      )}
    </div>
  );
};

export default InlineSuggestion;
