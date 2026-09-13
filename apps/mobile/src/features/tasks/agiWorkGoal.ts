export interface AgiWorkGoalInput {
  goal: string;
  constraints?: string;
  deliverable?: string;
}

export function buildAgiWorkGoalInput(
  goal: string,
  fields?: { constraints?: string; deliverable?: string },
): AgiWorkGoalInput | null {
  const objective = goal.trim();
  if (!objective) return null;
  const constraints = fields?.constraints?.trim();
  const deliverable = fields?.deliverable?.trim();
  return {
    goal: objective,
    ...(constraints ? { constraints } : {}),
    ...(deliverable ? { deliverable } : {}),
  };
}
