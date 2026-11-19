import { describe, expect, it } from 'vitest';
import {
  classifyAssistantFence,
  classifyStreamingFence,
  MODES_NOTE,
  settleStreamingFence,
} from '../assistantFence';

const FORM_SETTLED = ['title: Booking', 'text: Name*'].join('\n');
const CHART_SETTLED = ['title: Requests', 'x: Month', 'y: Requests', 'Jan | 10', 'Feb | 30'].join(
  '\n',
);

describe('classifyStreamingFence', () => {
  it('keeps the last whole line of a form while its next line is still arriving', () => {
    const partial = `${FORM_SETTLED}\nsel`;
    expect(classifyAssistantFence('form', partial).kind).toBe('fallback');
    const fence = classifyStreamingFence('form', partial, false);
    expect(fence?.kind).toBe('form');
    expect(settleStreamingFence('form', partial, false)?.source).toBe(FORM_SETTLED);
  });

  it('draws the rows of a chart that have arrived', () => {
    const fence = classifyStreamingFence('chart', `${CHART_SETTLED}\nMa`, false);
    expect(fence?.kind).toBe('chart');
    expect(fence?.kind === 'chart' ? fence.points.map((point) => point.label) : []).toEqual([
      'Jan',
      'Feb',
    ]);
  });

  it('shows nothing yet when no whole line parses', () => {
    expect(classifyStreamingFence('chart', 'title: Requests', false)).toBeNull();
    expect(classifyStreamingFence('form', 'sel', false)).toBeNull();
  });

  it('reports a closed fence as written, invalid or not', () => {
    expect(classifyStreamingFence('form', `${FORM_SETTLED}\nsel`, true)).toEqual(
      classifyAssistantFence('form', `${FORM_SETTLED}\nsel`),
    );
    expect(classifyStreamingFence('chart', CHART_SETTLED, true)?.kind).toBe('chart');
  });

  it('leaves code and unknown fences alone while they stream', () => {
    expect(classifyStreamingFence('ts', 'const a = 1;\nconst b', false)).toEqual({
      kind: 'code',
      language: 'ts',
      text: 'const a = 1;\nconst b',
    });
    expect(classifyStreamingFence('unknown', 'x', false)?.kind).toBe('fallback');
  });

  it('keeps the progressive email path', () => {
    const fence = classifyStreamingFence('email', 'To: ada@example.com\nSubject: Rev', false);
    expect(fence?.kind).toBe('email');
  });
});

describe('classifyAssistantFence card grid, modes and timeline fields', () => {
  it('carries the grid title and columns', () => {
    const fence = classifyAssistantFence(
      'cards',
      ['title: Plans', 'columns: 3', 'Fast | Quick answers', 'Deep | Long analysis'].join('\n'),
    );
    expect(fence).toMatchObject({ kind: 'cards', title: 'Plans', columns: 3, note: '' });
  });

  it('carries the display modes note', () => {
    const fence = classifyAssistantFence('modes', 'Fast | Quick answers');
    expect(fence).toMatchObject({ kind: 'cards', title: '', columns: 2, note: MODES_NOTE });
  });

  it('keeps a timeline step date when the step has one', () => {
    const fence = classifyAssistantFence(
      'timeline',
      ['Plan | Mar 1 | Scope agreed | Complete', 'Build | Coding | In progress'].join('\n'),
    );
    expect(fence.kind === 'timeline' ? fence.steps : []).toEqual([
      { title: 'Plan', detail: 'Scope agreed', name: 'Complete', date: 'Mar 1' },
      { title: 'Build', detail: 'Coding', name: 'In progress' },
    ]);
  });
});
