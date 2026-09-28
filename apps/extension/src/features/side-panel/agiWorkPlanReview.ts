import type { AgentActivityProgressEntry, AgentActivityState } from '@agiworkforce/client-runtime';
import { AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_PLAN_STEP_CHARS } from '@agiworkforce/cloud-contracts';
import {
  AGIWORK_PLAN_OVERVIEW_PROGRESS_ID,
  AGIWORK_PLAN_PROGRESS_ID_PREFIX,
} from '@agiworkforce/unified-chat/agi-work-progress';
import { renderIcon, X } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';

export interface AgiWorkPlanReviewBinding {
  steps: readonly string[];
  declined: boolean;
  busy: boolean;
  onStart?: (steps: string[]) => void;
  onCancel?: () => void;
}

export const AGIWORK_PLAN_REVIEW_CSS = `
  .sp-plan-review {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 6px 0;
    padding: 10px;
    border: 1px solid var(--agi-ext-border-strong);
    border-radius: var(--corner-control);
    background: var(--agi-ext-bg);
    white-space: normal;
  }
  .sp-plan-review__heading {
    margin: 0;
    color: var(--agi-ext-text);
    font-size: var(--type-body-size);
    font-weight: 600;
    line-height: var(--type-body-height);
  }
  .sp-plan-review__help,
  .sp-plan-review__declined {
    margin: 0;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-plan-review__help:empty { display: none; }
  .sp-plan-review__steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sp-plan-review__step { display: flex; align-items: flex-start; gap: 6px; }
  .sp-plan-review__ordinal {
    flex-shrink: 0;
    min-width: 16px;
    padding-top: 6px;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
  }
  .sp-plan-review__input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: var(--agi-ext-surface);
    color: var(--agi-ext-text);
    font: inherit;
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
    resize: vertical;
  }
  .sp-plan-review__remove,
  .sp-plan-review__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: none;
    color: var(--agi-ext-text-muted);
    font: inherit;
    font-size: var(--type-caption-size);
    cursor: pointer;
  }
  .sp-plan-review__remove { width: var(--control-sm); height: var(--control-sm); flex-shrink: 0; }
  .sp-plan-review__add { align-self: flex-start; padding: 3px 10px; }
  .sp-plan-review__remove:hover:not(:disabled),
  .sp-plan-review__add:hover:not(:disabled) { color: var(--agi-ext-text); border-color: var(--agi-ext-border-strong); }
  .sp-plan-review__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sp-plan-review button:disabled,
  .sp-plan-review__input:disabled { cursor: default; opacity: 0.5; }
  .sp-plan-review__input:focus-visible,
  .sp-plan-review button:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  @media (pointer: coarse) {
    .sp-plan-review button { min-height: 44px; min-width: 44px; }
  }
`;

const PLAN_LINE = /^\d+\.\s*(.+)$/;
const MAX_REMEMBERED_DRAFTS = 16;
const drafts = new Map<string, string[]>();

export function pendingAgiWorkPlanSteps(activity: AgentActivityState | undefined): string[] | null {
  if (!activity || activity.taskState !== 'ready_for_review') return null;
  const progress = activity.entries.filter(
    (entry): entry is AgentActivityProgressEntry => entry.kind === 'progress',
  );
  if (progress.some((entry) => entry.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX))) {
    return null;
  }
  const overview = progress.find((entry) => entry.progressId === AGIWORK_PLAN_OVERVIEW_PROGRESS_ID);
  const steps = (overview?.detail ?? '').split('\n').flatMap((line) => {
    const description = PLAN_LINE.exec(line.trim())?.[1]?.trim();
    return description ? [description] : [];
  });
  return steps.length > 0 ? steps : null;
}

function rememberedDraft(messageId: string, steps: readonly string[]): string[] {
  const existing = drafts.get(messageId);
  if (existing) return existing;
  const draft = steps.slice(0, AGIWORK_PLAN_MAX_STEPS);
  drafts.set(messageId, draft);
  while (drafts.size > MAX_REMEMBERED_DRAFTS) {
    const oldest = drafts.keys().next().value;
    if (oldest === undefined) break;
    drafts.delete(oldest);
  }
  return draft;
}

export function buildAgiWorkPlanReview(
  messageId: string,
  binding: AgiWorkPlanReviewBinding,
): HTMLElement {
  if (binding.declined) {
    return el(
      'p',
      { class: 'sp-plan-review__declined', role: 'status' },
      t('spPlanReviewDeclined'),
    );
  }
  const draft = rememberedDraft(messageId, binding.steps);
  const interactive = !binding.busy && binding.onStart !== undefined;
  const headingId = `sp-plan-review-${messageId}`;
  const section = el('section', { class: 'sp-plan-review', 'aria-labelledby': headingId });
  section.appendChild(
    el('h3', { class: 'sp-plan-review__heading', id: headingId }, t('spPlanReviewHeading')),
  );
  section.appendChild(el('p', { class: 'sp-plan-review__help' }, t('spPlanReviewHelp')));

  const list = el('ol', { class: 'sp-plan-review__steps' });
  const add = el(
    'button',
    { type: 'button', class: 'sp-plan-review__add' },
    t('spPlanReviewAddStep'),
  );
  const start = el(
    'button',
    { type: 'button', class: 'sp-agent-approval__button sp-agent-approval__button--approve' },
    t('spPlanReviewStart'),
  );
  const cancel = el(
    'button',
    { type: 'button', class: 'sp-clarify__dismiss' },
    t('spPlanReviewCancel'),
  );
  const empty = el('p', { class: 'sp-plan-review__help', role: 'status' });

  const cleaned = (): string[] => draft.map((step) => step.trim()).filter(Boolean);
  const refresh = (): void => {
    const ready = cleaned().length > 0;
    start.disabled = !interactive || !ready;
    empty.textContent = ready ? '' : t('spPlanReviewEmpty');
  };
  const focusStep = (index: number): void => {
    list.querySelectorAll<HTMLTextAreaElement>('.sp-plan-review__input')[index]?.focus();
  };
  const renderSteps = (): void => {
    list.replaceChildren(
      ...draft.map((description, index) => {
        const item = el('li', { class: 'sp-plan-review__step' });
        item.appendChild(
          el('span', { class: 'sp-plan-review__ordinal', 'aria-hidden': 'true' }, `${index + 1}.`),
        );
        const input = el('textarea', {
          class: 'sp-plan-review__input',
          rows: '2',
          maxlength: String(MAX_AGIWORK_PLAN_STEP_CHARS),
          'aria-label': t('spPlanReviewStep', [String(index + 1)]),
        });
        input.value = description;
        input.disabled = !interactive;
        input.addEventListener('input', () => {
          draft[index] = input.value;
          refresh();
        });
        const remove = el('button', {
          type: 'button',
          class: 'sp-plan-review__remove',
          'aria-label': t('spPlanReviewRemoveStep', [String(index + 1)]),
        });
        remove.appendChild(renderIcon(X, 14));
        remove.disabled = !interactive || draft.length <= 1;
        remove.addEventListener('click', () => {
          draft.splice(index, 1);
          renderSteps();
          refresh();
          focusStep(Math.min(index, draft.length - 1));
        });
        item.append(input, remove);
        return item;
      }),
    );
    add.hidden = draft.length >= AGIWORK_PLAN_MAX_STEPS;
  };

  add.disabled = !interactive;
  add.addEventListener('click', () => {
    if (draft.length >= AGIWORK_PLAN_MAX_STEPS) return;
    draft.push('');
    renderSteps();
    refresh();
    focusStep(draft.length - 1);
  });
  start.addEventListener('click', () => {
    const steps = cleaned();
    if (!interactive || steps.length === 0) return;
    drafts.delete(messageId);
    binding.onStart?.(steps);
  });
  cancel.disabled = binding.busy || binding.onCancel === undefined;
  cancel.addEventListener('click', () => {
    drafts.delete(messageId);
    binding.onCancel?.();
  });

  renderSteps();
  refresh();
  const actions = el('div', { class: 'sp-plan-review__actions' });
  actions.append(start, cancel);
  section.append(list, add, actions, empty);
  return section;
}
