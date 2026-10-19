import { describe, expect, it } from 'vitest';
import {
  parsePlanVisualization,
  planDocumentMarkdown,
  planDocumentNotes,
  renderPlanMarkdown,
} from '../integrations/planVisualization';

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

describe('plan as a document', () => {
  const plan = {
    explanation: 'Fix the average.',
    plan: [
      { step: 'Read math.ts', status: 'completed' as const },
      { step: 'Change the loop bound', status: 'pending' as const },
      { step: 'Run the tests', status: 'pending' as const },
    ],
  };

  it('writes the plan as a readable Markdown checklist under a title, without chat escaping', () => {
    expect(planDocumentMarkdown(plan)).toBe(
      '# Plan\n\nFix the average.\n\n- [x] Read math.ts\n- [ ] Change the loop bound\n- [ ] Run the tests\n',
    );
  });

  it('returns only what the reader added or deleted, under the line it follows', () => {
    const original = planDocumentMarkdown(plan);
    const edited = original
      .replace(
        '- [ ] Change the loop bound\n',
        '- [ ] Change the loop bound\nUse < instead of <=, and keep the empty-array guard.\n',
      )
      .replace('- [ ] Run the tests\n', '');

    expect(planDocumentNotes(original, edited)).toBe(
      'On "- [ ] Change the loop bound":\nUse < instead of <=, and keep the empty-array guard.\n\nRemove "- [ ] Run the tests"',
    );
    expect(planDocumentNotes(original, original)).toBe('');
  });
});

describe('the AGI CLI update_plan shape', () => {
  it('reads steps with descriptions and the CLI step statuses', () => {
    expect(
      parsePlanVisualization({
        steps: [
          { description: 'Read src/math.ts', status: 'done' },
          { description: 'Rename average to mean', status: 'in_progress' },
          { description: 'Run the tests' },
          { description: 'Old idea', status: 'superseded' },
        ],
      }),
    ).toEqual({
      plan: [
        { step: 'Read src/math.ts', status: 'completed' },
        { step: 'Rename average to mean', status: 'in_progress' },
        { step: 'Run the tests', status: 'pending' },
      ],
    });
  });

  it('refuses a status the CLI does not define', () => {
    expect(
      parsePlanVisualization({ steps: [{ description: 'x', status: 'toString' }] }),
    ).toBeUndefined();
  });
});
