import { describe, expect, it, vi } from 'vitest';

import { buildArtifactsDrawerSection } from '../src/features/side-panel/artifactsDrawer';
import { buildSchedulesSection } from '../src/features/side-panel/schedulesSection';
import { buildProjectsDrawerSection } from '../src/features/side-panel/projectsDrawer';
import type { ChromeArtifact } from '../src/features/cloud-bridge/artifactsClient';
import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';

// The drawer reads its copy from the extension catalogue, which only
// `chrome.i18n` can serve, so without this it cannot be built here at all.
(globalThis as unknown as Record<string, unknown>).chrome = {
  i18n: { getMessage: (key: string) => key },
};

/**
 * A live sweep only sees the states the signed-in account's data produces, so
 * these have to be pinned here. Both sections showed their "nothing here" copy
 * above their own "Loading…" line, because each painted the empty copy from an
 * empty local array before the first list had been asked for.
 */
function artifact(id: string): ChromeArtifact {
  return {
    conversationId: `11111111-1111-4111-8111-11111111111${id}`,
    messageId: `22222222-2222-4222-8222-22222222222${id}`,
    title: `Artifact ${id}`,
    type: 'code',
    language: 'ts',
    createdAt: '2026-09-01T00:00:00.000Z',
  } as ChromeArtifact;
}

function drawer(listArtifacts: ReturnType<typeof vi.fn>) {
  const api = buildArtifactsDrawerSection({
    listArtifacts: listArtifacts as never,
    readSource: vi.fn() as never,
    signIn: vi.fn() as never,
    openUrl: vi.fn(),
    writeClipboard: vi.fn(async () => undefined),
  });
  const empty = api.sectionEl.querySelector<HTMLElement>('.sp-drawer-artifacts-empty');
  const status = api.sectionEl.querySelector<HTMLElement>('.sp-drawer-artifacts-status');
  if (!empty || !status) throw new Error('drawer did not render its list states');
  return { api, empty, status };
}

describe('artifacts drawer empty state', () => {
  it('says nothing about emptiness before the first list is asked for', () => {
    const { empty } = drawer(vi.fn());

    expect(empty.hidden).toBe(true);
  });

  it('does not claim the account is empty while the list is loading', async () => {
    let settle!: (value: { status: 'success'; artifacts: ChromeArtifact[] }) => void;
    const pending = new Promise<{ status: 'success'; artifacts: ChromeArtifact[] }>((resolve) => {
      settle = resolve;
    });
    const { api, empty, status } = drawer(vi.fn(() => pending));

    const refreshed = api.refresh();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('Loading');
    expect(empty.hidden).toBe(true);

    settle({ status: 'success', artifacts: [] });
    await refreshed;

    expect(status.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
  });

  it('stays quiet once rows arrive', async () => {
    const { api, empty } = drawer(
      vi.fn(async () => ({ status: 'success', artifacts: [artifact('1')] })),
    );

    await api.refresh();

    expect(empty.hidden).toBe(true);
    expect(api.sectionEl.querySelectorAll('.sp-drawer-artifact')).toHaveLength(1);
  });

  it('shows the failure instead of an empty account when the list could not be read', async () => {
    const { api, empty, status } = drawer(
      vi.fn(async () => ({
        status: 'error',
        code: 'network_error',
        message: 'Could not reach AGI Cloud.',
      })),
    );

    await api.refresh();

    expect(status.textContent).toContain('Could not reach AGI Cloud.');
    expect(empty.hidden).toBe(true);
  });
});

function schedulesSection(listSchedules: ReturnType<typeof vi.fn>) {
  const api = buildSchedulesSection({
    listSchedules: listSchedules as never,
    setScheduleEnabled: vi.fn() as never,
    runScheduleNow: vi.fn() as never,
    signIn: vi.fn() as never,
    now: () => 1_757_800_000_000,
  });
  const empty = api.sectionEl.querySelector<HTMLElement>('.sp-schedules-empty');
  const status = api.sectionEl.querySelector<HTMLElement>('.sp-schedules-status');
  if (!empty || !status) throw new Error('section did not render its list states');
  return { api, empty, status };
}

describe('schedules section empty state', () => {
  it('says nothing about emptiness before the first list is asked for', () => {
    const { empty } = schedulesSection(vi.fn());

    expect(empty.hidden).toBe(true);
  });

  it('does not claim the account is empty while the list is loading', async () => {
    let settle!: (value: { status: 'success'; schedules: [] }) => void;
    const pending = new Promise<{ status: 'success'; schedules: [] }>((resolve) => {
      settle = resolve;
    });
    const { api, empty, status } = schedulesSection(vi.fn(() => pending));

    const refreshed = api.refresh();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('Loading');
    expect(empty.hidden).toBe(true);

    settle({ status: 'success', schedules: [] });
    await refreshed;

    expect(status.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
  });

  it('forgets that it ever listed when the section is deactivated', async () => {
    const { api, empty } = schedulesSection(
      vi.fn(async () => ({ status: 'success', schedules: [] })),
    );

    await api.refresh();
    expect(empty.hidden).toBe(false);

    api.setActive(true);
    api.setActive(false);
    expect(empty.hidden).toBe(true);
  });
});

function project(id: string): ManagedCloudProject {
  return { id, name: `Project ${id}`, conversationCount: 0 } as ManagedCloudProject;
}

function projectsDrawer(listProjects: ReturnType<typeof vi.fn>) {
  const api = buildProjectsDrawerSection({
    listProjects: listProjects as never,
    getActiveProject: () => null,
    setActiveProject: vi.fn(),
  });
  const empty = api.sectionEl.querySelector<HTMLElement>('.sp-drawer-projects-empty');
  const status = api.sectionEl.querySelector<HTMLElement>('.sp-drawer-projects-status');
  if (!empty || !status) throw new Error('drawer did not render its list states');
  return { api, empty, status };
}

describe('projects drawer empty state', () => {
  it('says nothing about emptiness before the first list is asked for', () => {
    const { empty } = projectsDrawer(vi.fn());

    expect(empty.hidden).toBe(true);
  });

  it('does not claim the account is empty while the list is loading', async () => {
    let settle!: (value: { status: 'success'; projects: ManagedCloudProject[] }) => void;
    const pending = new Promise<{ status: 'success'; projects: ManagedCloudProject[] }>(
      (resolve) => {
        settle = resolve;
      },
    );
    const { api, empty, status } = projectsDrawer(vi.fn(() => pending));

    const refreshed = api.refresh();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('Loading');
    expect(empty.hidden).toBe(true);

    settle({ status: 'success', projects: [] });
    await refreshed;

    expect(status.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
  });

  it('stays quiet once rows arrive', async () => {
    const { api, empty } = projectsDrawer(
      vi.fn(async () => ({ status: 'success', projects: [project('1')] })),
    );

    await api.refresh();

    expect(empty.hidden).toBe(true);
    expect(api.sectionEl.querySelectorAll('.sp-drawer-project')).toHaveLength(1);
  });

  it('shows the failure instead of an empty account when the list could not be read', async () => {
    const { api, empty, status } = projectsDrawer(
      vi.fn(async () => ({
        status: 'error',
        code: 'server_error',
        message: 'Could not reach AGI Cloud.',
      })),
    );

    await api.refresh();

    expect(status.textContent).toContain('Could not reach AGI Cloud.');
    expect(empty.hidden).toBe(true);
  });
});
