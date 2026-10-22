import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '@agiworkforce/ui';
import { AccountFooter, AccountFooterProvider, useAccountFooter } from './AccountFooter';

const baseProps = {
  loading: false,
  displayName: 'Ada Lovelace',
  initial: 'A',
  email: 'ada@example.com',
  tierLabel: 'Max',
  isFreeTier: false,
  menuItems: <DropdownMenuItem>Settings</DropdownMenuItem>,
  onFreePlanUpgrade: vi.fn(),
  desktopDownload: null,
};

describe('AccountFooter', () => {
  it('shows the avatar initial, name, plan and opens the account menu', async () => {
    const user = userEvent.setup();
    render(<AccountFooter {...baseProps} />);

    const trigger = screen.getByRole('button', { name: 'Account menu for Ada Lovelace' });
    expect(trigger).toHaveTextContent('A');
    expect(trigger).toHaveTextContent('Ada Lovelace');
    expect(trigger).toHaveTextContent('Max');

    await user.click(trigger);
    expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
  });

  it('holds a loading row until the account settles', () => {
    render(<AccountFooter {...baseProps} loading />);
    expect(screen.getByRole('status', { name: 'Loading account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull();
  });
});

describe('useAccountFooter', () => {
  function Consumer() {
    return <>{useAccountFooter() ?? 'none'}</>;
  }

  it('hands a provided footer to a surface with its own column, and nothing otherwise', () => {
    const { rerender } = render(<Consumer />);
    expect(screen.getByText('none')).toBeInTheDocument();

    rerender(
      <AccountFooterProvider footer={<span>footer</span>}>
        <Consumer />
      </AccountFooterProvider>,
    );
    expect(screen.getByText('footer')).toBeInTheDocument();
  });
});
