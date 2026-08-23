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

  it('offers included skills to chat and keeps draft directory entries non-executable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            skills: [
              {
                name: 'code-review',
                description: 'Review code.',
                source: 'bundled',
                lifecycle: 'included',
                downloadable: true,
              },
              {
                name: 'unreleased-fixture',
                description: 'A draft catalog entry.',
                source: 'bundled',
                lifecycle: 'draft',
                downloadable: false,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useSkillsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.skills.map((skill) => skill.name)).toEqual(['code-review']);
  });
});
