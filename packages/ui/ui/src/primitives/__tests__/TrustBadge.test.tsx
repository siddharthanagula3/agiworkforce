import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustBadge } from '../TrustBadge';

describe('TrustBadge', () => {
  it.each([
    ['local', 'Local', '--success-text'],
    ['byok', 'BYOK', '--warning-text'],
    ['managed', 'Managed Cloud', '--info-text'],
  ] as const)('%s renders its label with the text-role token', (boundary, label, tokenName) => {
    const { container } = render(<TrustBadge boundary={boundary} label={label} />);

    const badge = container.querySelector(`[data-trust-boundary="${boundary}"]`);
    expect(screen.getByText(label)).toBeTruthy();
    expect(badge?.className).toContain(`text-[var(${tokenName})]`);
    expect(badge?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('can drop the icon when a neighbouring badge already carries it', () => {
    const { container } = render(<TrustBadge boundary="byok" label="BYOK" showIcon={false} />);

    expect(container.querySelector('svg')).toBeNull();
  });
});
