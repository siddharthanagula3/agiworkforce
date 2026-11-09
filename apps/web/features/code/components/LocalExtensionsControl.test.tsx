import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillListResponse, SkillSummary } from '@agiworkforce/types/protocol';
import { LOCAL_CODE_COPY } from '../local-code';

const listDeveloperSkills = vi.fn<(rootId: string) => Promise<SkillListResponse>>();
const listDeveloperPlugins = vi.fn(async () => []);
const setDeveloperSkillConsent =
  vi.fn<(rootId: string, granted: boolean, digest?: string) => Promise<boolean>>();
const setDeveloperSkillEnabled = vi.fn();
const setDeveloperPluginEnabled = vi.fn();

vi.mock('@/features/desktop-host', () => ({
  listDeveloperSkills: (rootId: string) => listDeveloperSkills(rootId),
  listDeveloperPlugins: () => listDeveloperPlugins(),
  setDeveloperSkillConsent: (rootId: string, granted: boolean, digest?: string) =>
    setDeveloperSkillConsent(rootId, granted, digest),
  setDeveloperSkillEnabled: (...args: unknown[]) => setDeveloperSkillEnabled(...args),
  setDeveloperPluginEnabled: (...args: unknown[]) => setDeveloperPluginEnabled(...args),
}));

const { LocalExtensionsControl } = await import('./LocalExtensionsControl');

function projectSkill(consented: boolean): SkillSummary {
  return {
    name: 'team-lint',
    description: 'Review lint results',
    scope: 'project',
    path: '/work/.agiworkforce/skills/team-lint',
    enabled: false,
    consented,
    requiredTools: [],
    requiredEnvVars: [],
    missingTools: [],
    missingEnvVars: [],
  };
}

async function openControl() {
  const user = userEvent.setup();
  render(<LocalExtensionsControl rootId="root-1" />);
  await user.click(screen.getByRole('button', { name: LOCAL_CODE_COPY.extensions }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  listDeveloperPlugins.mockResolvedValue([]);
});

describe("trusting a folder's skills", () => {
  it('sends the digest of the skills it listed along with the yes', async () => {
    listDeveloperSkills.mockResolvedValue({
      skills: [projectSkill(false)],
      projectSkillsDigest: 'digest-of-the-listed-skills',
    });
    setDeveloperSkillConsent.mockResolvedValue(true);
    const user = await openControl();

    await user.click(
      await screen.findByRole('button', { name: LOCAL_CODE_COPY.trustProjectSkills }),
    );

    await waitFor(() =>
      expect(setDeveloperSkillConsent).toHaveBeenCalledWith(
        'root-1',
        true,
        'digest-of-the-listed-skills',
      ),
    );
  });

  it('lists the skills as they are now, and says so, when the set changed under the yes', async () => {
    listDeveloperSkills
      .mockResolvedValueOnce({ skills: [projectSkill(false)], projectSkillsDigest: 'digest-a' })
      .mockResolvedValueOnce({
        skills: [projectSkill(false), { ...projectSkill(false), name: 'added-later' }],
        projectSkillsDigest: 'digest-b',
      })
      .mockResolvedValue({
        skills: [projectSkill(false), { ...projectSkill(false), name: 'added-later' }],
        projectSkillsDigest: 'digest-b',
      });
    setDeveloperSkillConsent.mockRejectedValueOnce(
      new Error(
        "This folder's skills changed while they were being reviewed, so nothing was allowed",
      ),
    );
    const user = await openControl();

    await user.click(
      await screen.findByRole('button', { name: LOCAL_CODE_COPY.trustProjectSkills }),
    );

    expect(await screen.findByText('added-later')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was allowed/u);
    expect(setDeveloperSkillConsent).toHaveBeenCalledTimes(1);
    expect(setDeveloperSkillConsent).toHaveBeenCalledWith('root-1', true, 'digest-a');
  });

  it('stops trusting with a revoke', async () => {
    listDeveloperSkills.mockResolvedValue({
      skills: [projectSkill(true)],
      projectSkillsDigest: 'digest-of-the-listed-skills',
    });
    setDeveloperSkillConsent.mockResolvedValue(false);
    const user = await openControl();

    await user.click(
      await screen.findByRole('button', { name: LOCAL_CODE_COPY.revokeProjectSkills }),
    );

    await waitFor(() => expect(setDeveloperSkillConsent).toHaveBeenCalledTimes(1));
    expect(setDeveloperSkillConsent.mock.calls[0]?.[1]).toBe(false);
  });
});
