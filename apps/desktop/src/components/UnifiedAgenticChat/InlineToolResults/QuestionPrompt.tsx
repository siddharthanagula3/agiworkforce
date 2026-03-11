/**
 * QuestionPrompt -- Inline tool result renderer for the `question` tool.
 *
 * When the agent needs user input, this component displays a card with
 * selectable choices. The user picks one (or several in multi-select mode)
 * and submits. The answer is sent back to the Rust backend via the
 * `question_answer` Tauri command, unblocking the waiting agent tool.
 *
 * Once the tool has completed, the component renders the final answer
 * in read-only mode derived from the tool result data.
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@/lib/tauri-mock';
import { invoke } from '@/lib/tauri-mock';
import { HelpCircle, Check } from 'lucide-react';
import type { ToolResultProps } from './index';

interface QuestionEvent {
  id: string;
  question: string;
  choices: string[];
  multiSelect: boolean;
}

export function QuestionPrompt({ result }: ToolResultProps) {
  const [pending, setPending] = useState<QuestionEvent | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState<unknown>(null);

  // Listen for incoming question events from the Rust backend
  useEffect(() => {
    const unlisten = listen<QuestionEvent>('question:ask', (event) => {
      setPending(event.payload);
      setSelected(new Set());
      setSubmitted(false);
      setSubmittedAnswer(null);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleChoice = useCallback(
    (choice: string) => {
      if (submitted || !pending) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (pending.multiSelect) {
          if (next.has(choice)) {
            next.delete(choice);
          } else {
            next.add(choice);
          }
        } else {
          next.clear();
          next.add(choice);
        }
        return next;
      });
    },
    [submitted, pending],
  );

  const handleSubmit = useCallback(async () => {
    if (!pending || selected.size === 0) return;
    const answerValue = pending.multiSelect ? Array.from(selected) : Array.from(selected)[0];
    setSubmitted(true);
    setSubmittedAnswer(answerValue);
    try {
      await invoke('question_answer', { id: pending.id, answer: answerValue });
    } catch (err) {
      // Best-effort: the tool executor will timeout if the answer doesn't arrive
      console.error('Failed to submit question answer:', err);
    }
  }, [pending, selected]);

  // If the tool already completed, show the stored answer from result data
  const data = result?.data as Record<string, unknown> | undefined;
  if (data?.['answer'] !== undefined) {
    const rawAnswer = data['answer'];
    const displayAnswer = Array.isArray(rawAnswer)
      ? (rawAnswer as string[]).join(', ')
      : String(rawAnswer);
    return (
      <div className="mt-3 rounded-lg border border-border/50 bg-card p-3">
        <div className="flex items-center gap-2 text-sm font-medium mb-1.5">
          <HelpCircle className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-foreground">{String(data['question'] ?? '')}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Answered: <span className="text-foreground font-medium">{displayAnswer}</span>
        </div>
      </div>
    );
  }

  // Nothing to render yet
  if (!pending) return null;

  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-card p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <HelpCircle className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="text-foreground">{pending.question}</span>
      </div>

      <div className="space-y-1.5">
        {pending.choices.map((choice) => {
          const isSelected = selected.has(choice);
          return (
            <button
              key={choice}
              type="button"
              onClick={() => toggleChoice(choice)}
              disabled={submitted}
              className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors
                ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-accent/50 text-foreground'
                }
                ${submitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className="flex items-center gap-2">
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                {choice}
              </span>
            </button>
          );
        })}
      </div>

      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Submit
        </button>
      )}

      {submitted && submittedAnswer !== null && (
        <div className="text-xs text-muted-foreground">
          Answered:{' '}
          {Array.isArray(submittedAnswer)
            ? (submittedAnswer as string[]).join(', ')
            : String(submittedAnswer)}
        </div>
      )}
    </div>
  );
}
