import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSkillsNotice } from './WorkspaceSkillsNotice';

const withheld = {
  skillsDir: '/work/site/.agiworkforce/skills',
  skillCount: 2,
  consented: false,
  changedSinceConsent: false,
};

describe('WorkspaceSkillsNotice', () => {
  it('shows nothing when the open project has no skills', async () => {
    const loadStatus = vi.fn().mockResolvedValue({
      skillsDir: null,
      skillCount: 0,
      consented: false,
      changedSinceConsent: false,
    });
    const { container } = render(
      <WorkspaceSkillsNotice loadStatus={loadStatus} setConsent={vi.fn()} />,
    );

    await waitFor(() => expect(loadStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says the instructions are withheld and why allowing them is a trust decision', async () => {
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue(withheld)}
        setConsent={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'This project brings 2 skills the model cannot read yet',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('/work/site/.agiworkforce/skills')).toBeInTheDocument();
    expect(screen.getByText(/withheld until you allow them/)).toBeInTheDocument();
    expect(screen.getByText(/only for a folder you trust/)).toBeInTheDocument();
    expect(
      screen.getByText(/Your system asks you to confirm and lists the skills/),
    ).toBeInTheDocument();
  });

  it('says the skills changed when an earlier consent no longer covers them', async () => {
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue({ ...withheld, changedSinceConsent: true })}
        setConsent={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: "This project's skills changed since you allowed them",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/withheld again/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow project skills' })).toBeInTheDocument();
  });

  it('says nothing changed when the system prompt is declined', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue(withheld)}
        setConsent={vi.fn().mockResolvedValue(withheld)}
        onChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Allow project skills' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Nothing changed.');
    expect(screen.getByRole('button', { name: 'Allow project skills' })).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('records consent and then offers to withdraw it', async () => {
    const user = userEvent.setup();
    const setConsent = vi.fn().mockResolvedValue({ ...withheld, consented: true });
    const onChanged = vi.fn();
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue(withheld)}
        setConsent={setConsent}
        onChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Allow project skills' }));

    expect(setConsent).toHaveBeenCalledWith(true);
    expect(
      await screen.findByRole('button', { name: 'Stop sharing project skills' }),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('withdraws consent', async () => {
    const user = userEvent.setup();
    const setConsent = vi.fn().mockResolvedValue(withheld);
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue({ ...withheld, consented: true })}
        setConsent={setConsent}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Stop sharing project skills' }));

    expect(setConsent).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('button', { name: 'Allow project skills' })).toBeInTheDocument();
  });

  it('reports a consent that could not be written and keeps the state', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSkillsNotice
        loadStatus={vi.fn().mockResolvedValue(withheld)}
        setConsent={vi.fn().mockRejectedValue(new Error('Read-only file system'))}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Allow project skills' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Read-only file system');
    expect(screen.getByRole('button', { name: 'Allow project skills' })).toBeInTheDocument();
  });
});
