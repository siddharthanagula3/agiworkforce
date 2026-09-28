'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createFrameCoalescedAppender } from '@/lib/client/frame-coalesced-appender';
import { toUserMessage } from '@/lib/user-error-message';
import { streamCompareAnswer } from './compare-answer-stream';

export type CompareAnswerPhase = 'queued' | 'streaming' | 'done' | 'stopped' | 'failed';

export interface CompareAnswer {
  modelId: string;
  phase: CompareAnswerPhase;
  text: string;
  error: string | null;
  finishReason: string | null;
  resolvedModelId: string | null;
  firstTextMs: number | null;
  totalMs: number | null;
}

export interface CompareRun {
  prompt: string;
  answers: readonly CompareAnswer[];
}

const ANSWER_FAILED_MESSAGE = 'This model could not answer. Try again.';

function queuedAnswer(modelId: string): CompareAnswer {
  return {
    modelId,
    phase: 'queued',
    text: '',
    error: null,
    finishReason: null,
    resolvedModelId: null,
    firstTextMs: null,
    totalMs: null,
  };
}

function isActive(answer: CompareAnswer): boolean {
  return answer.phase === 'queued' || answer.phase === 'streaming';
}

export function useCompareAnswers() {
  const [run, setRun] = useState<CompareRun | null>(null);
  const generationRef = useRef(0);
  const controllersRef = useRef<AbortController[]>([]);

  const patchAnswer = useCallback(
    (generation: number, index: number, patch: (answer: CompareAnswer) => CompareAnswer) => {
      if (generationRef.current !== generation) return;
      setRun((current) =>
        current
          ? {
              ...current,
              answers: current.answers.map((answer, position) =>
                position === index ? patch(answer) : answer,
              ),
            }
          : current,
      );
    },
    [],
  );

  const abortAll = useCallback(() => {
    generationRef.current += 1;
    for (const controller of controllersRef.current) controller.abort();
    controllersRef.current = [];
  }, []);

  const stop = useCallback(() => {
    abortAll();
    setRun((current) =>
      current
        ? {
            ...current,
            answers: current.answers.map((answer) =>
              isActive(answer) ? { ...answer, phase: 'stopped' } : answer,
            ),
          }
        : current,
    );
  }, [abortAll]);

  const start = useCallback(
    (prompt: string, modelIds: readonly string[], concurrency: number) => {
      abortAll();
      const generation = generationRef.current;
      const controllers = modelIds.map(() => new AbortController());
      controllersRef.current = controllers;
      setRun({ prompt, answers: modelIds.map(queuedAnswer) });

      const appender = createFrameCoalescedAppender({
        onFlush: (_kind, key, text) =>
          patchAnswer(generation, Number(key), (answer) => ({
            ...answer,
            text: answer.text + text,
          })),
      });

      let nextIndex = 0;
      const drain = async (): Promise<void> => {
        while (nextIndex < modelIds.length && generationRef.current === generation) {
          const index = nextIndex;
          nextIndex += 1;
          const modelId = modelIds[index];
          const controller = controllers[index];
          if (!modelId || !controller) continue;

          const startedAt = performance.now();
          let sawText = false;
          patchAnswer(generation, index, (answer) => ({ ...answer, phase: 'streaming' }));
          try {
            const outcome = await streamCompareAnswer(modelId, prompt, controller.signal, {
              onStart: (resolvedModelId) =>
                patchAnswer(generation, index, (answer) => ({ ...answer, resolvedModelId })),
              onText: (text) => {
                if (!sawText) {
                  sawText = true;
                  const firstTextMs = performance.now() - startedAt;
                  patchAnswer(generation, index, (answer) => ({ ...answer, firstTextMs }));
                }
                appender.append('content', String(index), text);
              },
            });
            appender.flush();
            const totalMs = performance.now() - startedAt;
            patchAnswer(generation, index, (answer) => ({
              ...answer,
              phase: 'done',
              finishReason: outcome.finishReason,
              totalMs,
            }));
          } catch (error) {
            appender.flush();
            if (controller.signal.aborted) return;
            patchAnswer(generation, index, (answer) => ({
              ...answer,
              phase: 'failed',
              error: toUserMessage(error, ANSWER_FAILED_MESSAGE),
            }));
          }
        }
      };

      const workers = Math.max(1, Math.min(concurrency, modelIds.length));
      for (let worker = 0; worker < workers; worker += 1) void drain();
    },
    [abortAll, patchAnswer],
  );

  useEffect(() => abortAll, [abortAll]);

  const running = run?.answers.some(isActive) ?? false;

  return { run, running, start, stop };
}
