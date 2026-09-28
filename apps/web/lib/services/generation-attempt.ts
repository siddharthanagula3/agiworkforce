export type GenerationAttemptOutcome = 'completed' | 'failed' | 'cancelled';

export interface GenerationAttempt {
  outcome: GenerationAttemptOutcome;
  errorClass?: string | undefined;
}

const ERROR_CLASS_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function attemptErrorClass(attempt: GenerationAttempt): string | null {
  return attempt.outcome === 'failed' &&
    attempt.errorClass !== undefined &&
    ERROR_CLASS_PATTERN.test(attempt.errorClass)
    ? attempt.errorClass
    : null;
}
