import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import {
  MOVE_TO_APPLICATIONS,
  applicationsFolderStore,
  offerMoveToApplications,
  type ApplicationsFolderHost,
} from '../applicationsFolder';

function host(overrides: Partial<ApplicationsFolderHost> = {}): ApplicationsFolderHost {
  return {
    platform: 'darwin',
    isPackaged: () => true,
    isInApplicationsFolder: () => false,
    moveToApplicationsFolder: vi.fn(() => true),
    ...overrides,
  };
}

function memoryStore(asked = false) {
  let value = asked;
  return {
    asked: () => value,
    markAsked: vi.fn(() => {
      value = true;
    }),
  };
}

describe('offering to move the app into Applications', () => {
  it('asks in one line named from the registry, with a plain way to decline', () => {
    expect(MOVE_TO_APPLICATIONS.message).toBe(`Move ${PRODUCT_NAMES.desktop} to Applications?`);
    expect(MOVE_TO_APPLICATIONS.decline).toBe('Not now');
  });

  it('moves the app when the person agrees', async () => {
    const appHost = host();
    const ask = vi.fn(async () => true);

    const outcome = await offerMoveToApplications(appHost, memoryStore(), ask);

    expect(outcome).toBe('moved');
    expect(ask).toHaveBeenCalledWith(MOVE_TO_APPLICATIONS);
    expect(appHost.moveToApplicationsFolder).toHaveBeenCalledTimes(1);
  });

  it('remembers Not now and never asks again', async () => {
    const store = memoryStore();
    const appHost = host();
    const ask = vi.fn(async () => false);

    expect(await offerMoveToApplications(appHost, store, ask)).toBe('declined');
    expect(await offerMoveToApplications(appHost, store, ask)).toBe('not-offered');

    expect(ask).toHaveBeenCalledTimes(1);
    expect(appHost.moveToApplicationsFolder).not.toHaveBeenCalled();
  });

  it('records the question as answered before the move, which relaunches the app', async () => {
    const store = memoryStore();
    const appHost = host({
      moveToApplicationsFolder: vi.fn(() => {
        expect(store.asked()).toBe(true);
        return true;
      }),
    });

    await offerMoveToApplications(appHost, store, async () => true);

    expect(appHost.moveToApplicationsFolder).toHaveBeenCalledTimes(1);
  });

  it('does not ask again after a move that failed or was cancelled', async () => {
    const store = memoryStore();
    const failing = host({ moveToApplicationsFolder: vi.fn(() => false) });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const throwing = host({
      moveToApplicationsFolder: vi.fn(() => {
        throw new Error('copy failed');
      }),
    });

    expect(await offerMoveToApplications(failing, store, async () => true)).toBe('failed');
    expect(await offerMoveToApplications(throwing, memoryStore(), async () => true)).toBe('failed');
    expect(await offerMoveToApplications(failing, store, async () => true)).toBe('not-offered');
  });

  it.each([
    ['an unpackaged build', host({ isPackaged: () => false })],
    ['a copy already in Applications', host({ isInApplicationsFolder: () => true })],
    ['another platform', host({ platform: 'win32' })],
  ])('stays out of the way for %s', async (_name, appHost) => {
    const ask = vi.fn(async () => true);

    expect(await offerMoveToApplications(appHost, memoryStore(), ask)).toBe('not-offered');

    expect(ask).not.toHaveBeenCalled();
  });
});

describe('the answer kept on disk', () => {
  it('survives a relaunch and reads as not asked when the file is missing or damaged', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agi-apps-folder-'));
    const file = path.join(dir, 'applications-folder.json');

    expect(applicationsFolderStore(file).asked()).toBe(false);

    applicationsFolderStore(file).markAsked();
    expect(applicationsFolderStore(file).asked()).toBe(true);

    writeFileSync(file, 'not json');
    expect(applicationsFolderStore(file).asked()).toBe(false);
  });
});
