import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSkillsList } from './use-skills-list';

describe('useSkillsList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed when the server returns malformed catalog metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            skills: [{ name: 42, description: 'invalid', source: 'bundled' }],
          }),
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useSkillsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.skills).toEqual([]);
    expect(result.current.error).toBe('Invalid skills response');
  });
});
