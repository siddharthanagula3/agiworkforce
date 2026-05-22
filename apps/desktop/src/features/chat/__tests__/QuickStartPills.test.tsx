import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuickStartPills } from '../QuickStartPills';

describe('QuickStartPills', () => {
  it('surfaces demo-ready workflow labels', () => {
    render(<QuickStartPills onPillClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skills/i })).toBeInTheDocument();
  });

  it('injects a complete workflow prompt instead of a generic fragment', async () => {
    const user = userEvent.setup();
    const onPillClick = vi.fn();

    render(<QuickStartPills onPillClick={onPillClick} />);
    await user.click(screen.getByRole('button', { name: /browser/i }));

    expect(onPillClick).toHaveBeenCalledWith(
      'web',
      expect.stringContaining('Use the browser to complete this workflow'),
    );
  });

  it('keeps demo-critical workflow prompts complete for each action pill', async () => {
    const user = userEvent.setup();
    const onPillClick = vi.fn();

    render(<QuickStartPills onPillClick={onPillClick} />);

    await user.click(screen.getByRole('button', { name: /research/i }));
    await user.click(screen.getByRole('button', { name: /code/i }));
    await user.click(screen.getByRole('button', { name: /write/i }));

    expect(onPillClick).toHaveBeenNthCalledWith(
      1,
      'research',
      expect.stringContaining('compare the strongest alternatives'),
    );
    expect(onPillClick).toHaveBeenNthCalledWith(
      2,
      'code',
      expect.stringContaining('explain the safest implementation plan'),
    );
    expect(onPillClick).toHaveBeenNthCalledWith(
      3,
      'write',
      expect.stringContaining('investor-ready update'),
    );
  });
});
