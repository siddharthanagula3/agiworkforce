'use client';

import { useMemo, useState } from 'react';
import { Pencil, Printer } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { MarkdownContent } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';
import { FlashcardsView } from './FlashcardsView';
import { QuizView } from './QuizView';
import { FlashcardsEditor, QuizEditor } from './StudySetEditors';
import {
  parseFlashcards,
  parseQuiz,
  replaceStudyBlock,
  serializeFlashcards,
  serializeQuiz,
  studySegments,
} from './study-set';
import { flashcardsPrintHtml, printHtml, quizPrintHtml } from './study-print';

export function StudyDocument({
  content,
  className,
  editable,
  onSave,
  onAsk,
}: {
  content: string;
  className?: string;
  editable: boolean;
  onSave: (next: string) => void;
  onAsk?: (prompt: string) => boolean;
}) {
  const segments = useMemo(() => studySegments(content), [content]);
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <div
      className={cn('overflow-auto bg-background px-5 py-6 sm:px-8', className)}
      data-testid="study-document"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {segments.map((segment, position) => {
          if (segment.kind === 'markdown') {
            return <MarkdownContent key={position} content={segment.text} />;
          }
          const quiz = segment.kind === 'quiz' ? parseQuiz(segment.source) : null;
          const cards = segment.kind === 'flashcards' ? parseFlashcards(segment.source) : null;
          if (!quiz && !cards) {
            return (
              <p key={position} className="text-sm text-muted-foreground" role="status">
                This {segment.kind === 'quiz' ? 'quiz' : 'flashcard set'} could not be read.
              </p>
            );
          }
          const isEditing = editing === segment.start;
          const save = (source: string) => {
            onSave(
              replaceStudyBlock(
                content,
                segment.start,
                segment.kind as 'quiz' | 'flashcards',
                source,
              ),
            );
            setEditing(null);
          };
          return (
            <div key={position} className="flex flex-col gap-2">
              {quiz ? (
                isEditing ? (
                  <QuizEditor
                    initial={quiz}
                    onCancel={() => setEditing(null)}
                    onSave={(next) => save(serializeQuiz(next))}
                  />
                ) : (
                  <QuizView key={segment.source} quiz={quiz} {...(onAsk ? { onAsk } : {})} />
                )
              ) : cards ? (
                isEditing ? (
                  <FlashcardsEditor
                    initial={cards}
                    onCancel={() => setEditing(null)}
                    onSave={(next) => save(serializeFlashcards(next))}
                  />
                ) : (
                  <FlashcardsView key={segment.source} set={cards} />
                )
              ) : null}
              {!isEditing ? (
                <div className="flex gap-1">
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setEditing(segment.start)}
                      data-testid="study-edit"
                    >
                      <Pencil className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                      Edit {quiz ? 'quiz' : 'cards'}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      printHtml(quiz ? quizPrintHtml(quiz) : flashcardsPrintHtml(cards!))
                    }
                    data-testid="study-print"
                  >
                    <Printer className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                    Print
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
