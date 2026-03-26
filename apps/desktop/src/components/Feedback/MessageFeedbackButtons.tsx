import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, X, Send } from 'lucide-react';
import { feedback } from '@agiworkforce/api';

interface MessageFeedbackButtonsProps {
  messageId: string;
  conversationId?: string;
  /** Compact mode — inline with message */
  compact?: boolean;
}

type FeedbackState = 'none' | 'positive' | 'negative' | 'correction';

export function MessageFeedbackButtons({
  messageId,
  conversationId,
  compact = true,
}: MessageFeedbackButtonsProps) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('none');
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const recordFeedback = useCallback(
    async (type: 'positive' | 'negative' | 'correction', correctionText?: string) => {
      setSubmitting(true);
      try {
        await feedback.recordMessageFeedback(
          messageId,
          conversationId ?? null,
          type,
          correctionText ?? null,
          null,
        );
        setFeedbackState(type);
        if (type === 'correction') {
          setShowCorrection(false);
          setCorrection('');
        }
      } catch (err) {
        console.error('Failed to record feedback:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [messageId, conversationId],
  );

  const handleThumbsUp = () => {
    if (feedbackState === 'positive') return;
    recordFeedback('positive');
  };

  const handleThumbsDown = () => {
    if (feedbackState === 'negative') {
      setShowCorrection(true);
      return;
    }
    recordFeedback('negative');
  };

  const handleSubmitCorrection = () => {
    if (!correction.trim()) return;
    recordFeedback('correction', correction);
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <button
          onClick={handleThumbsUp}
          disabled={submitting}
          className={`p-1 rounded transition-colors ${
            feedbackState === 'positive'
              ? 'text-green-500 bg-green-500/10'
              : 'text-muted-foreground/40 hover:text-green-500 hover:bg-green-500/10'
          }`}
          title="Good response"
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          onClick={handleThumbsDown}
          disabled={submitting}
          className={`p-1 rounded transition-colors ${
            feedbackState === 'negative' || feedbackState === 'correction'
              ? 'text-red-500 bg-red-500/10'
              : 'text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10'
          }`}
          title="Bad response"
        >
          <ThumbsDown className="h-3 w-3" />
        </button>

        {feedbackState === 'negative' && !showCorrection && (
          <button
            onClick={() => setShowCorrection(true)}
            className="p-1 rounded text-muted-foreground/40 hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
            title="Provide correction"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}

        {showCorrection && (
          <div className="flex items-center gap-1 ml-1">
            <input
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitCorrection()}
              placeholder="What should it have said?"
              className="text-xs rounded border border-input bg-background px-2 py-0.5 w-48"
              autoFocus
            />
            <button
              onClick={handleSubmitCorrection}
              disabled={!correction.trim() || submitting}
              className="p-0.5 text-primary hover:text-primary/80 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
            </button>
            <button
              onClick={() => setShowCorrection(false)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Non-compact (card mode)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/30 p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Was this helpful?</span>
        <button
          onClick={handleThumbsUp}
          disabled={submitting}
          className={`p-1.5 rounded-md transition-colors ${
            feedbackState === 'positive'
              ? 'text-green-500 bg-green-500/10 border border-green-500/30'
              : 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10 border border-transparent'
          }`}
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          onClick={handleThumbsDown}
          disabled={submitting}
          className={`p-1.5 rounded-md transition-colors ${
            feedbackState === 'negative' || feedbackState === 'correction'
              ? 'text-red-500 bg-red-500/10 border border-red-500/30'
              : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent'
          }`}
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </div>

      {(feedbackState === 'negative' || showCorrection) && (
        <div className="flex items-center gap-2">
          <input
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitCorrection()}
            placeholder="How should it have responded?"
            className="flex-1 text-sm rounded-md border border-input bg-background px-3 py-1.5"
            autoFocus
          />
          <button
            onClick={handleSubmitCorrection}
            disabled={!correction.trim() || submitting}
            className="px-2 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      )}

      {feedbackState === 'positive' && (
        <span className="text-xs text-green-500">Thanks for your feedback!</span>
      )}
      {feedbackState === 'correction' && (
        <span className="text-xs text-blue-500">
          Correction recorded — the AI will learn from this.
        </span>
      )}
    </div>
  );
}
