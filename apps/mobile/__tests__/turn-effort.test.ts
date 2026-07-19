/**
 * resolveTurnEffort fixes the silently-dropped reasoning-effort bug: effort_levels
 * models send the picked effort regardless of the Thinking toggle, unsupported
 * (stale cross-model) values are dropped, and none/minimal are forwarded when
 * supported.
 */
import { resolveTurnEffort } from '../src/features/chat/utils/turnEffort';

const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

describe('resolveTurnEffort', () => {
  it('sends a supported effort for an effort_levels model even when Thinking is off', () => {
    expect(
      resolveTurnEffort({
        selectedEffort: 'high',
        supportedEfforts: EFFORTS,
        reasoningControl: 'effort_levels',
        thinkingEnabled: false,
      }),
    ).toBe('high');
  });

  it('forwards none/minimal when the model supports them', () => {
    expect(
      resolveTurnEffort({
        selectedEffort: 'none',
        supportedEfforts: EFFORTS,
        reasoningControl: 'effort_levels',
        thinkingEnabled: false,
      }),
    ).toBe('none');
    expect(
      resolveTurnEffort({
        selectedEffort: 'minimal',
        supportedEfforts: ['minimal', 'low', 'medium'],
        reasoningControl: 'effort_levels',
        thinkingEnabled: false,
      }),
    ).toBe('minimal');
  });

  it('drops an effort the current model does not support (stale cross-model value)', () => {
    expect(
      resolveTurnEffort({
        selectedEffort: 'none',
        supportedEfforts: ['low', 'medium', 'high'],
        reasoningControl: 'effort_levels',
        thinkingEnabled: true,
      }),
    ).toBeUndefined();
  });

  it('for a toggle-based model, effort rides only with Thinking on', () => {
    const base = {
      selectedEffort: 'high',
      supportedEfforts: EFFORTS,
      reasoningControl: 'toggle' as const,
    };
    expect(resolveTurnEffort({ ...base, thinkingEnabled: false })).toBeUndefined();
    expect(resolveTurnEffort({ ...base, thinkingEnabled: true })).toBe('high');
  });
});
