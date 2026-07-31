import { describe, expect, it } from 'vitest';
import { parsePlanVisualization, renderPlanMarkdown } from '../integrations/planVisualization';

describe('plan visualization boundary', () => {
  it('parses a bounded update_plan payload and renders native checklist state', () => {
    const plan = parsePlanVisualization({
      explanation: 'Implement in two safe stages.',
      plan: [
        { step: 'Inspect the current flow', status: 'completed' },
        { step: 'Add the focused UI', status: 'in_progress' },
        { step: 'Run regression tests', status: 'pending' },
      ],
    });

    expect(plan).toBeDefined();
    expect(renderPlanMarkdown(plan!)).toContain('- [x] Inspect the current flow');
    expect(renderPlanMarkdown(plan!)).toContain('- [ ] **In progress:** Add the focused UI');
    expect(renderPlanMarkdown(plan!)).toContain('- [ ] Run regression tests');
  });

  it('rejects malformed status, oversized steps, and too many rows', () => {
    expect(
      parsePlanVisualization({ plan: [{ step: 'Do it', status: 'started' }] }),
    ).toBeUndefined();
    expect(
      parsePlanVisualization({ plan: [{ step: 'x'.repeat(501), status: 'pending' }] }),
    ).toBeUndefined();
    expect(
      parsePlanVisualization({
        plan: Array.from({ length: 51 }, (_, index) => ({
          step: `Step ${index}`,
          status: 'pending',
        })),
      }),
    ).toBeUndefined();
  });

  it('escapes model-authored Markdown and command-link syntax', () => {
    const plan = parsePlanVisualization({
      explanation: '[Run](command:workbench.action.closeWindow)',
      plan: [{ step: '<script> **danger**', status: 'pending' }],
    });
    const markdown = renderPlanMarkdown(plan!);

    expect(markdown).not.toContain('[Run](command:');
    expect(markdown).not.toContain('<script>');
    expect(markdown).toContain('\\[Run\\]\\(command:workbench');
    expect(markdown).toContain('&lt;script&gt; \\*\\*danger\\*\\*');
  });
});
