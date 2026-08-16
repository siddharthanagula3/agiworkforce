
export interface ModelSwitchCacheInput {
  priorModelId: string | null | undefined;
  nextModelId: string;
  priorTurnCount: number;
  priorModelLabel?: string;
  nextModelLabel?: string;
}

export interface ModelSwitchCacheAssessment {
  resetsCache: boolean;
  warn: boolean;
  reason: 'no-prior-model' | 'no-prior-turns' | 'same-model' | 'cache-reset';
  message: string;
}

const NO_WARN = (reason: ModelSwitchCacheAssessment['reason']): ModelSwitchCacheAssessment => ({
  resetsCache: false,
  warn: false,
  reason,
  message: '',
});

export function assessModelSwitchCache(input: ModelSwitchCacheInput): ModelSwitchCacheAssessment {
  const { priorModelId, nextModelId, priorTurnCount } = input;

  if (priorTurnCount <= 0) return NO_WARN('no-prior-turns');
  if (!priorModelId) return NO_WARN('no-prior-model');
  if (priorModelId === nextModelId) return NO_WARN('same-model');

  const from = input.priorModelLabel || priorModelId;
  const to = input.nextModelLabel || nextModelId;
  return {
    resetsCache: true,
    warn: true,
    reason: 'cache-reset',
    message:
      `Switching from ${from} to ${to} starts a new prompt cache. ` +
      `Your conversation so far will be re-processed at full input price ` +
      `(no cached discount) until the new cache builds. Keeping the same model reuses the cache.`,
  };
}
