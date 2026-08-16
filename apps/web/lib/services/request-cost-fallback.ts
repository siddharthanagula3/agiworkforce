export interface RequestFallbackCandidate {
  model: string;
  provider: string;
}

export function selectCheapestRequestFallback<T extends RequestFallbackCandidate>(input: {
  currentModelIds: ReadonlySet<string>;
  currentRequestCostCents: number;
  candidates: readonly T[];
  estimateRequestCostCents: (candidate: T) => number;
}): T | null {
  const ranked = input.candidates
    .filter((candidate) => !input.currentModelIds.has(candidate.model.toLowerCase()))
    .map((candidate) => ({
      candidate,
      costCents: input.estimateRequestCostCents(candidate),
    }))
    .filter(({ costCents }) => costCents < input.currentRequestCostCents)
    .sort(
      (left, right) =>
        left.costCents - right.costCents ||
        left.candidate.model.localeCompare(right.candidate.model),
    );

  return ranked[0]?.candidate ?? null;
}
