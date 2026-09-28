import type { DeveloperStepStatus } from '@agiworkforce/types/protocol';

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

const THREAD_STEP_STATUS: Readonly<Record<DeveloperStepStatus, PlanStepStatus | undefined>> = {
  pending: 'pending',
  in_progress: 'in_progress',
  done: 'completed',
  blocked: 'pending',
  skipped: 'completed',
  superseded: undefined,
};

export function planFromThread(
  plan: ReadonlyArray<{ description: string; status: DeveloperStepStatus }> | undefined,
  todos: ReadonlyArray<{ content: string; status: DeveloperStepStatus }> | undefined,
): PlanVisualization | undefined {
  const source =
    plan !== undefined && plan.length > 0
      ? plan.map((step) => ({ text: step.description, status: step.status }))
      : (todos ?? []).map((todo) => ({ text: todo.content, status: todo.status }));
  const steps = source
    .flatMap(({ text, status }) => {
      const mapped = THREAD_STEP_STATUS[status];
      const step = text.replace(/\s+/gu, ' ').trim();
      return mapped === undefined || step === ''
        ? []
        : [{ step: step.slice(0, MAX_STEP_CHARS), status: mapped }];
    })
    .slice(0, MAX_PLAN_STEPS);
  return steps.length === 0 ? undefined : { plan: steps };
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_{}[\]()#+.!|-])/gu, '\\$1')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

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
