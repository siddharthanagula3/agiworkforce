import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CodeFirstRunWizard } from './CodeFirstRunWizard';

describe('CodeFirstRunWizard', () => {
  it('walks the three steps in order with a step count', async () => {
    const user = userEvent.setup();
    render(<CodeFirstRunWizard onFinish={vi.fn()} />);

    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up AGI Code' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Get started' }));

    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    const terminalHeading = screen.getByRole('heading', { name: 'Connect your terminal' });
    expect(terminalHeading).toHaveFocus();
    expect(screen.getByText('agi login')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Install the CLI first' })).toHaveAttribute(
      'href',
      '/cli',
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connect GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      '/api/github/install/start?returnPath=%2Fcode',
    );
  });

  it('goes back a step, and leaves the setup from the first step', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<CodeFirstRunWizard onFinish={onFinish} />);

    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'Set up AGI Code' })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('copies the sign-in command and says when the copy fails', async () => {
    const user = userEvent.setup();
    render(<CodeFirstRunWizard onFinish={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Get started' }));

    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('agi login');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copied' }));
    expect(
      await screen.findByRole('button', { name: 'Could not copy the command' }),
    ).toBeInTheDocument();
  });

  it('finishes when the GitHub step is skipped or the app install starts', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<CodeFirstRunWizard onFinish={onFinish} />);
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('button', { name: 'Skip this step' }));
    expect(onFinish).toHaveBeenCalledTimes(1);

    const install = screen.getByRole('link', { name: 'Connect GitHub' });
    install.addEventListener('click', (event) => event.preventDefault());
    await user.click(install);
    expect(onFinish).toHaveBeenCalledTimes(2);
  });
});
