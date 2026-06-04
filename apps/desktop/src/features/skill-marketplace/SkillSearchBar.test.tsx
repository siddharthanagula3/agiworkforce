import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSkillMarketplaceStore } from '../../stores/skillMarketplaceStore';
import { SkillSearchBar } from './SkillSearchBar';

describe('SkillSearchBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSkillMarketplaceStore.setState({
      searchQuery: '',
      selectedCategory: 'all',
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps typed search text visible while debouncing the store update', () => {
    render(<SkillSearchBar />);

    const input = screen.getByRole('searchbox', { name: /search skills/i });
    fireEvent.change(input, { target: { value: 'web' } });

    expect(input).toHaveValue('web');

    vi.advanceTimersByTime(300);
    expect(useSkillMarketplaceStore.getState().searchQuery).toBe('web');
  });
});
