/**
 * The lifecycle a model moves through, and the moves that are legal.
 *
 * One vocabulary, owned here and read by the compiler, the promotion tool, the
 * retirement tool and the probe. A stage is a claim about what has actually
 * been done to a model, so every advance names a date and the source that
 * justifies it, exactly like the release and deprecation dates beside it.
 *
 * @module model-registry/lifecycle-stages
 */

export const LIFECYCLE_STAGE = {
  discovered: 'discovered',
  registered: 'registered',
  probed: 'probed',
  benchmarked: 'benchmarked',
  evaluated: 'evaluated',
  shadow: 'shadow',
  canary: 'canary',
  promoted: 'promoted',
  observed: 'observed',
  deprecated: 'deprecated',
  removed: 'removed',
};

/** The mandate's order. Index is the only comparison anything may make. */
export const LIFECYCLE_STAGES = Object.freeze([
  LIFECYCLE_STAGE.discovered,
  LIFECYCLE_STAGE.registered,
  LIFECYCLE_STAGE.probed,
  LIFECYCLE_STAGE.benchmarked,
  LIFECYCLE_STAGE.evaluated,
  LIFECYCLE_STAGE.shadow,
  LIFECYCLE_STAGE.canary,
  LIFECYCLE_STAGE.promoted,
  LIFECYCLE_STAGE.observed,
  LIFECYCLE_STAGE.deprecated,
  LIFECYCLE_STAGE.removed,
]);

const STAGE_INDEX = new Map(LIFECYCLE_STAGES.map((stage, index) => [stage, index]));

/**
 * Moves that skip a stage, each with the reason the catalog needs it.
 *
 * A shortcut is not a convenience: it records that the skipped stage genuinely
 * did not happen, so the stage still reports what was actually done.
 */
export const LIFECYCLE_STAGE_SHORTCUTS = Object.freeze([
  {
    from: LIFECYCLE_STAGE.registered,
    to: LIFECYCLE_STAGE.evaluated,
    reason:
      'the provider or an aggregator publishes sourced scores for the model, so evaluation rests on those rather than on an AGI probe and benchmark run',
  },
  {
    from: LIFECYCLE_STAGE.registered,
    to: LIFECYCLE_STAGE.shadow,
    reason:
      'a preview route is addressable but never served, which is what shadow already means; it reaches shadow without scores of its own',
  },
  {
    from: LIFECYCLE_STAGE.probed,
    to: LIFECYCLE_STAGE.evaluated,
    reason:
      'the scores are sourced from outside AGI, so no AGI benchmark run stands between the probe and the evaluation',
  },
  {
    from: LIFECYCLE_STAGE.evaluated,
    to: LIFECYCLE_STAGE.promoted,
    reason:
      'every promotion in this catalog predates the shadow and canary stages; recording those would invent runs that never happened. New promotions go through canary',
  },
  {
    from: LIFECYCLE_STAGE.promoted,
    to: LIFECYCLE_STAGE.observed,
    reason: 'observation begins the moment a promoted model starts serving',
  },
]);

const SHORTCUTS = new Map(
  LIFECYCLE_STAGE_SHORTCUTS.map((shortcut) => [`${shortcut.from}>${shortcut.to}`, shortcut.reason]),
);

export function isLifecycleStage(value) {
  return typeof value === 'string' && STAGE_INDEX.has(value);
}

export function lifecycleStageIndex(stage) {
  const index = STAGE_INDEX.get(stage);
  if (index === undefined) throw new Error(`Unknown lifecycle stage ${String(stage)}`);
  return index;
}

export function stageAtOrAfter(stage, floor) {
  return lifecycleStageIndex(stage) >= lifecycleStageIndex(floor);
}

export function stageAtOrBefore(stage, ceiling) {
  return lifecycleStageIndex(stage) <= lifecycleStageIndex(ceiling);
}

/**
 * A provider can withdraw a model at any stage, so deprecation is reachable
 * from everywhere. Removal is reachable only from deprecation: a model the
 * catalog never announced as going away must not vanish from it.
 */
export function isAllowedStageTransition(from, to) {
  if (!isLifecycleStage(from) || !isLifecycleStage(to)) return false;
  if (from === to) return true;
  if (to === LIFECYCLE_STAGE.deprecated) return true;
  if (to === LIFECYCLE_STAGE.removed) return from === LIFECYCLE_STAGE.deprecated;
  if (from === LIFECYCLE_STAGE.deprecated || from === LIFECYCLE_STAGE.removed) return false;
  if (lifecycleStageIndex(to) === lifecycleStageIndex(from) + 1) return true;
  return SHORTCUTS.has(`${from}>${to}`);
}

export function allowedNextStages(from) {
  return LIFECYCLE_STAGES.filter(
    (stage) => stage !== from && isAllowedStageTransition(from, stage),
  );
}

export function stageTransitionRejection(modelKey, from, to) {
  if (isAllowedStageTransition(from, to)) return null;
  return `${modelKey} cannot move from lifecycle stage ${from} to ${to}; allowed next stages are ${allowedNextStages(
    from,
  ).join(', ')}`;
}

export function stageCensus(stagesByModelKey) {
  const census = new Map(LIFECYCLE_STAGES.map((stage) => [stage, 0]));
  for (const stage of Object.values(stagesByModelKey)) {
    census.set(stage, (census.get(stage) ?? 0) + 1);
  }
  return census;
}

export function formatStageCensus(stagesByModelKey) {
  return [...stageCensus(stagesByModelKey)]
    .filter(([, count]) => count > 0)
    .map(([stage, count]) => `${stage} ${count}`)
    .join(', ');
}
