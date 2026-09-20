// Kept apart from the recorder so the label bound can read the vocabulary
// without the cardinality layer importing the instruments it bounds.
export const WORK_PLAN_MEASURES = ['steps', 'completed'] as const;

export type WorkPlanMeasure = (typeof WORK_PLAN_MEASURES)[number];

export const WORK_PLAN_SHAPES = ['planned', 'revised'] as const;

export type WorkPlanShape = (typeof WORK_PLAN_SHAPES)[number];
