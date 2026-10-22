'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button, Textarea } from '@agiworkforce/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { addCsrfHeaders } from '@/lib/client/csrf';

type Rating = 'up' | 'down';
type SendState = 'idle' | 'sending' | 'sent' | 'failed';

const COMMENT_MAX_CHARS = 2_000;
const SUBJECT_TITLE_MAX_CHARS = 120;
const SEND_FAILED = 'Could not send your feedback. Try again.';

const RATING_LABELS: Readonly<Record<Rating, string>> = {
  up: 'Helpful',
  down: 'Not helpful',
};

interface ArticleFeedbackProps {
  articleId: string;
  articleTitle: string;
  path: string;
}

async function postFeedback(body: {
  subject: string;
  message: string;
  path: string;
  rating?: Rating;
}): Promise<void> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      subject: body.subject,
      message: body.message,
      metadata: {
        source: 'web',
        platform: 'web',
        version: process.env['NEXT_PUBLIC_APP_VERSION'] ?? 'unknown',
        user_agent: navigator.userAgent,
        page_path: body.path,
        ...(body.rating ? { rating: body.rating } : {}),
      },
    }),
  });
  if (!response.ok) throw new Error(`Feedback request failed with ${response.status}`);
}

export function ArticleFeedback({ articleId, articleTitle, path }: ArticleFeedbackProps) {
  const headingId = useId();
  const [rating, setRating] = useState<Rating | null>(null);
  const [ratingState, setRatingState] = useState<SendState>('idle');
  const [comment, setComment] = useState('');
  const [commentState, setCommentState] = useState<SendState>('idle');
  const subjectTitle = articleTitle.slice(0, SUBJECT_TITLE_MAX_CHARS);
  const trimmedComment = comment.trim();
  const voted = ratingState === 'sent' && rating !== null;

  async function vote(next: Rating) {
    if (ratingState === 'sending' || voted) return;
    setRatingState('sending');
    try {
      await postFeedback({
        subject: `Help article rated ${RATING_LABELS[next].toLowerCase()}: ${subjectTitle}`,
        message: `${RATING_LABELS[next]}: ${articleId}`,
        path,
        rating: next,
      });
      setRating(next);
      setRatingState('sent');
    } catch {
      setRatingState('failed');
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating || !trimmedComment || commentState === 'sending') return;
    setCommentState('sending');
    try {
      await postFeedback({
        subject: `Help article comment (${RATING_LABELS[rating].toLowerCase()}): ${subjectTitle}`,
        message: trimmedComment,
        path,
      });
      setCommentState('sent');
      setComment('');
    } catch {
      setCommentState('failed');
    }
  }

  const failed = ratingState === 'failed' || commentState === 'failed';
  const statusMessage = failed
    ? SEND_FAILED
    : commentState === 'sent'
      ? 'Thanks, your feedback was sent.'
      : voted
        ? 'Thanks for the feedback.'
        : '';

  return (
    <section className="dx-feedback" aria-labelledby={headingId}>
      <h2 className="dx-feedback-title" id={headingId}>
        Was this article helpful?
      </h2>
      <div className="dx-feedback-votes">
        <Button
          type="button"
          variant="ghost"
          className="dx-action"
          aria-pressed={rating === 'up'}
          disabled={ratingState === 'sending' || voted}
          onClick={() => void vote('up')}
        >
          <ThumbsUp aria-hidden="true" />
          <span>Yes</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="dx-action"
          aria-pressed={rating === 'down'}
          disabled={ratingState === 'sending' || voted}
          onClick={() => void vote('down')}
        >
          <ThumbsDown aria-hidden="true" />
          <span>No</span>
        </Button>
      </div>
      {voted && commentState !== 'sent' ? (
        <form className="dx-feedback-form" onSubmit={(event) => void submitComment(event)}>
          <Textarea
            className="dx-feedback-input"
            aria-label="Additional feedback"
            placeholder="Additional feedback (optional)"
            maxLength={COMMENT_MAX_CHARS}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button
            type="submit"
            variant="ghost"
            className="dx-action dx-feedback-submit"
            disabled={!trimmedComment || commentState === 'sending'}
          >
            Submit
          </Button>
        </form>
      ) : null}
      {statusMessage ? (
        <p className="dx-feedback-status" role={failed ? 'alert' : 'status'}>
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
