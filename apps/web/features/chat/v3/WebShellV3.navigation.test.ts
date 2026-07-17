import { describe, expect, it } from 'vitest';
import { resolveWebViewRoute } from './WebShellV3';

describe('WebShellV3 managed route navigation', () => {
  it('routes the schedules view to the canonical schedule manager', () => {
    expect(resolveWebViewRoute('schedules')).toBe('/schedules');
  });
});
