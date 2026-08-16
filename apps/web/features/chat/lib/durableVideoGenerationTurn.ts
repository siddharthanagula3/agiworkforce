export type VideoTranscriptCommitResult =
  | { ok: true }
  | { ok: false; phase: 'prompt' | 'placeholder'; error: unknown };

interface VideoTranscriptCommitInput {
  temporary: boolean;
  persistPrompt: () => Promise<void>;
  persistPlaceholder: () => Promise<void>;
  attempts?: number;
}

async function retryIdempotentSave(save: () => Promise<void>, attempts: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await save();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function commitVideoTranscriptBeforeStart(
  input: VideoTranscriptCommitInput,
): Promise<VideoTranscriptCommitResult> {
  if (input.temporary) return { ok: true };
  const attempts = Math.max(1, Math.min(input.attempts ?? 2, 3));
  try {
    await retryIdempotentSave(input.persistPrompt, attempts);
  } catch (error) {
    return { ok: false, phase: 'prompt', error };
  }
  try {
    await retryIdempotentSave(input.persistPlaceholder, attempts);
  } catch (error) {
    return { ok: false, phase: 'placeholder', error };
  }
  return { ok: true };
}

export async function startVideoAfterTranscriptCommit<T>(
  input: VideoTranscriptCommitInput & { start: () => Promise<T> },
): Promise<{ ok: true; started: T } | Exclude<VideoTranscriptCommitResult, { ok: true }>> {
  const committed = await commitVideoTranscriptBeforeStart(input);
  if (!committed.ok) return committed;
  return { ok: true, started: await input.start() };
}
