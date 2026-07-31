export type PlanStepStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanVisualizationStep {
  step: string;
  status: PlanStepStatus;
}

export interface PlanVisualization {
  explanation?: string;
  plan: PlanVisualizationStep[];
}

const MAX_PLAN_STEPS = 50;
const MAX_STEP_CHARS = 500;
const MAX_EXPLANATION_CHARS = 2_000;
const STATUSES = new Set<PlanStepStatus>(['pending', 'in_progress', 'completed']);

/** Parse the model-authored update_plan tool input as bounded display data. */
export function parsePlanVisualization(input: unknown): PlanVisualization | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  const candidate = input as { explanation?: unknown; plan?: unknown };
  if (!Array.isArray(candidate.plan) || candidate.plan.length > MAX_PLAN_STEPS) return undefined;

  const plan: PlanVisualizationStep[] = [];
  for (const rawItem of candidate.plan) {
    if (rawItem === null || typeof rawItem !== 'object') return undefined;
    const item = rawItem as { step?: unknown; status?: unknown };
    if (typeof item.step !== 'string' || typeof item.status !== 'string') return undefined;
    const step = item.step.replace(/\s+/gu, ' ').trim();
    if (
      step === '' ||
      step.length > MAX_STEP_CHARS ||
      !STATUSES.has(item.status as PlanStepStatus)
    ) {
      return undefined;
    }
    plan.push({ step, status: item.status as PlanStepStatus });
  }

  const explanation =
    typeof candidate.explanation === 'string'
      ? candidate.explanation.replace(/\s+/gu, ' ').trim()
      : '';
  if (explanation.length > MAX_EXPLANATION_CHARS) return undefined;
  return { ...(explanation === '' ? {} : { explanation }), plan };
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_{}[\]()#+.!|-])/gu, '\\$1')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

/** Render a native VS Code Chat checklist without allowing Markdown injection. */
export function renderPlanMarkdown(visualization: PlanVisualization): string {
  const lines = ['\n\n### Plan'];
  if (visualization.explanation !== undefined) {
    lines.push('', escapeMarkdownText(visualization.explanation));
  }
  if (visualization.plan.length === 0) {
    lines.push('', '_No plan steps yet._');
  } else {
    lines.push('');
    for (const item of visualization.plan) {
      const checked = item.status === 'completed' ? 'x' : ' ';
      const prefix = item.status === 'in_progress' ? '**In progress:** ' : '';
      lines.push(`- [${checked}] ${prefix}${escapeMarkdownText(item.step)}`);
    }
  }
  return `${lines.join('\n')}\n\n`;
}
