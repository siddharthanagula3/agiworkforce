import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_REASONING_EFFORT_LABELS,
  type DeveloperReasoningEffort,
} from '@agiworkforce/local-runtime-contract';
import { LOCAL_CODE_COPY } from '../local-code';
import { LocalTurnControls } from './LocalTurnControls';

function renderControls(effortLevels: readonly DeveloperReasoningEffort[]) {
  const onEffortChange = vi.fn();
  render(
    <LocalTurnControls
      agentMode="ask"
      reasoningEffort="medium"
      effortLevels={effortLevels}
      showMode={false}
      showEffort
      disabled={false}
      onModeChange={vi.fn()}
      onEffortChange={onEffortChange}
    />,
  );
  return { onEffortChange };
}

async function openEffortMenu() {
  await userEvent
    .setup()
    .click(
      screen.getByRole('button', { name: new RegExp(`^${LOCAL_CODE_COPY.reasoningEffort}`, 'u') }),
    );
  return screen.getAllByRole('menuitemradio').map((item) => item.textContent);
}

describe('local turn effort levels', () => {
  it('offers every level it is given, labelled from the shared ladder', async () => {
    renderControls(DEVELOPER_REASONING_EFFORTS);
    expect(await openEffortMenu()).toEqual(
      DEVELOPER_REASONING_EFFORTS.map((effort) => DEVELOPER_REASONING_EFFORT_LABELS[effort]),
    );
  });

  it('offers only the levels the selected model takes', async () => {
    renderControls(['none', 'medium', 'xhigh']);
    expect(await openEffortMenu()).toEqual(['None', 'Medium', 'xHigh']);
  });

  it('shows no effort control for a model that takes none', () => {
    renderControls([]);
    expect(
      screen.queryByRole('button', {
        name: new RegExp(`^${LOCAL_CODE_COPY.reasoningEffort}`, 'u'),
      }),
    ).toBeNull();
  });
});
