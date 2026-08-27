import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COMING_SOON_LABEL } from '@/lib/marketing-constants';
import { BrowserControlRequirementDialog } from '../BrowserControlRequirementDialog';
import { COMPUTER_USE_ON_WEB, listComputerUseExecutors, primaryExecutorCta } from '../availability';
import { BROWSER_CONTROL_COPY, BROWSER_CONTROL_TEST_IDS, executorTestId } from '../constants';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowserControlRequirementDialog — where the work runs', () => {
  it('renders nothing while closed', () => {
    render(
      <BrowserControlRequirementDialog open={false} onClose={vi.fn()} subscriptionTier="pro" />,
    );

    expect(screen.queryByTestId(BROWSER_CONTROL_TEST_IDS.dialog)).toBeNull();
  });

  it('names every executing client the capability contract lists, with its shipping status', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    const executors = listComputerUseExecutors();
    expect(executors.length).toBeGreaterThan(1);
    for (const executor of executors) {
      const row = screen.getByTestId(executorTestId(executor.surface));
      expect(row.textContent).toContain(executor.label);
      expect(row.textContent).toContain(executor.status);
    }
  });

  it('does not claim a shipped client is coming soon', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    const desktop = screen.getByTestId(executorTestId('desktop'));
    expect(desktop.textContent).not.toContain(COMING_SOON_LABEL);
  });

  it('points its primary call to action at a client that ships today', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    const cta = primaryExecutorCta(listComputerUseExecutors());
    const link = screen.getByTestId(BROWSER_CONTROL_TEST_IDS.primaryCta);
    expect(link.getAttribute('href')).toBe(cta.href);
    expect(link.textContent).toBe(cta.label);
  });

  it('reports this page as unavailable using the shared presentation', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.hereLine).textContent).toBe(
      COMPUTER_USE_ON_WEB.statusLabel,
    );
  });

  it('discloses the screenshot egress the executing client performs', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    expect(screen.getByText(BROWSER_CONTROL_COPY.sends)).toBeTruthy();
  });

  it('offers no control that would start a session', async () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="max_15x" />);

    const user = userEvent.setup();
    for (const button of screen.getAllByRole('button')) {
      await user.click(button);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /start|run|launch|begin/iu })).toBeNull();
  });

  it('states that nothing is billed, and promises no metering it cannot keep', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="max_15x" />);

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.billedLine).textContent).toBe(
      BROWSER_CONTROL_COPY.billed,
    );
    expect(BROWSER_CONTROL_COPY.billed).not.toMatch(/meter/iu);
  });
});

describe('BrowserControlRequirementDialog — plan reporting', () => {
  it('reports a plan without computer use as excluded', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="free" />);

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.planLine).textContent).toBe(
      BROWSER_CONTROL_COPY.planBlocked,
    );
  });

  it('says the plan is unknown rather than denying it before billing answers', () => {
    render(
      <BrowserControlRequirementDialog
        open
        onClose={vi.fn()}
        subscriptionTier="free"
        planKnown={false}
      />,
    );

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.planLine).textContent).toBe(
      BROWSER_CONTROL_COPY.planUnknown,
    );
  });

  it('quotes no monthly request limit for an entitled plan', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="max_15x" />);

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.planLine).textContent).toBe(
      BROWSER_CONTROL_COPY.planIncluded,
    );
  });
});

describe('BrowserControlRequirementDialog — focus and dismissal', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    const dialog = screen.getByTestId(BROWSER_CONTROL_TEST_IDS.dialog);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside the dialog', async () => {
    render(<BrowserControlRequirementDialog open onClose={vi.fn()} subscriptionTier="pro" />);

    const dialog = screen.getByTestId(BROWSER_CONTROL_TEST_IDS.dialog);
    const user = userEvent.setup();
    for (let step = 0; step < 8; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<BrowserControlRequirementDialog open onClose={onClose} subscriptionTier="pro" />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the dismiss control', async () => {
    const onClose = vi.fn();
    render(<BrowserControlRequirementDialog open onClose={onClose} subscriptionTier="pro" />);

    await userEvent.click(screen.getByRole('button', { name: BROWSER_CONTROL_COPY.dismiss }));

    expect(onClose).toHaveBeenCalled();
  });
});
