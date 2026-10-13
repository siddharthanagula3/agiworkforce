import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { modelsCatalogJson } from '@agiworkforce/types';

import { RELEASES } from '@/lib/changelog-entries';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { SURFACE_STATUS } from '@/lib/surface-status';
import {
  DOC_MATURITIES,
  DOC_MATURITY_LABELS,
  MANAGED_CLOUD_MATURITY,
  MANAGED_CLOUD_ONLY_PLATFORMS,
  RELEASED_DOC_PLATFORMS,
  publishedMaturity,
} from '@/lib/support/doc-metadata';
import {
  RELEASE_NOTES,
  RELEASE_STATE_DATES,
  releaseStateLine,
  releasedNoteCount,
} from '../release-notes-data';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

function repoText(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), 'utf8');
}

function noteFor(date: string) {
  const note = RELEASE_NOTES.find((entry) => entry.date === date);
  if (!note) throw new Error(`no release note dated ${date}`);
  return note;
}

describe('release notes', () => {
  it('states a maturity and a surface for every dated release', () => {
    expect(RELEASE_NOTES.length).toBe(RELEASES.length);
    for (const note of RELEASE_NOTES) {
      expect(note.surfaces.length, note.date).toBeGreaterThan(0);
      expect(['ga', 'beta', 'alpha'], note.date).toContain(note.maturity);
    }
  });

  it('records no maturity for a release that does not exist', () => {
    const dates = new Set(RELEASES.map((release) => release.date));
    for (const date of RELEASE_STATE_DATES) {
      expect(dates.has(date), `${date} is not a dated release`).toBe(true);
    }
  });

  it('names only surfaces the product actually has', () => {
    const surfaces = Object.keys(SURFACE_STATUS);
    for (const note of RELEASE_NOTES) {
      for (const surface of note.surfaces) {
        expect(surfaces, note.date).toContain(surface);
      }
    }
  });

  it('never calls a release GA when every surface it shipped on is unreleased', () => {
    for (const note of RELEASE_NOTES) {
      const released = note.surfaces.some((surface) => RELEASED_DOC_PLATFORMS.includes(surface));
      if (!released) expect(note.maturity, note.date).not.toBe('ga');
    }
  });

  it('renders a state line a reader can scan', () => {
    const cloudLabel = DOC_MATURITY_LABELS[MANAGED_CLOUD_MATURITY];
    expect(releaseStateLine(noteFor('2026-09-05'))).toBe(`${cloudLabel} · Web`);
    expect(releaseStateLine(noteFor('2026-02 to 2026-05'))).toBe('Not yet released: Desktop');
    expect(releaseStateLine(noteFor('2026-07-31'))).toBe(
      `${cloudLabel} · Web · Not yet released: CLI, Desktop`,
    );
  });

  it('never prints a release as more mature than the managed cloud it runs on', () => {
    expect(MANAGED_CLOUD_STATUS).toBe(`public ${MANAGED_CLOUD_MATURITY}`);
    expect(
      RELEASED_DOC_PLATFORMS.every((platform) => MANAGED_CLOUD_ONLY_PLATFORMS.includes(platform)),
    ).toBe(true);

    const ceiling = DOC_MATURITIES.indexOf(MANAGED_CLOUD_MATURITY);
    let onReleasedSurface = 0;
    for (const note of RELEASE_NOTES) {
      if (!note.surfaces.some((surface) => RELEASED_DOC_PLATFORMS.includes(surface))) continue;
      onReleasedSurface += 1;
      const published = publishedMaturity(note.maturity, note.surfaces);
      expect(DOC_MATURITIES.indexOf(published), note.date).toBeGreaterThanOrEqual(ceiling);
      expect(releaseStateLine(note), note.date).toMatch(
        new RegExp(`^${DOC_MATURITY_LABELS[published]} · `, 'u'),
      );
      if (MANAGED_CLOUD_MATURITY !== 'ga') {
        expect(releaseStateLine(note), note.date).not.toMatch(/\bGA\b/u);
      }
    }
    expect(onReleasedSurface).toBeGreaterThan(0);
    expect(DOC_MATURITIES.reduce((total, maturity) => total + releasedNoteCount(maturity), 0)).toBe(
      onReleasedSurface,
    );
    if (MANAGED_CLOUD_MATURITY !== 'ga') expect(releasedNoteCount('ga')).toBe(0);
  });
});

describe('release notes describe capabilities the code actually carries', () => {
  it('names only local runtimes the model catalogue publishes', () => {
    const note = noteFor('2026-07-03');
    const body = note.body.join(' ');
    const localProviderLabels = Object.values(modelsCatalogJson.providers)
      .map((provider) => provider.label)
      .filter((label) => label.endsWith('(Local)'))
      .map((label) => label.replace(/\s+\(Local\)$/, ''));
    for (const runtime of ['Ollama', 'LM Studio']) {
      expect(body, `${runtime} is not in the release note`).toContain(runtime);
      expect(localProviderLabels, `${runtime} is not a catalogued local provider`).toContain(
        runtime,
      );
    }
  });

  it('limits the fail-closed egress release to the surfaces represented by that entry', () => {
    const note = noteFor('2026-06-24');
    expect(note.body.join(' ')).toContain('each implemented route');
    expect(Object.keys(SURFACE_STATUS).length).toBe(6);
    expect(note.surfaces).toEqual(['web', 'cli']);
  });

  it('keeps the CLI v1.0 release short of GA while the installer refuses that release', () => {
    const note = noteFor('2026-05-03');
    expect(note.maturity).not.toBe('ga');
    expect(repoText('apps', 'web', 'public', 'install.sh')).toContain(
      'Release signature metadata is missing; refusing to install unverified bytes',
    );
  });

  it('speaks of the CLI v1.0 release only in the past tense now that the repository no longer holds it', () => {
    const cli = noteFor('2026-05-03');
    expect(cli.headline).not.toMatch(/\blive\b/i);
    const body = cli.body.join(' ');
    expect(body).toContain('a GitHub release this repository no longer holds');
    for (const present of [
      /\byet\b/i,
      /\bworks against\b/i,
      /\brefuses\b/i,
      /\bdoes not carry\b/i,
    ]) {
      expect(body).not.toMatch(present);
    }
  });

  it('speaks of the Tauri build only in the past tense once it has left the public download flows', () => {
    expect(noteFor('2026-09-15').body.join(' ')).toContain(
      'The earlier Tauri build leaves the public download flows',
    );
    const tauri = noteFor('2026-02 to 2026-05').body.join(' ');
    expect(tauri).toMatch(/\bTauri\b/);
    for (const present of [/\byet\b/i, /\bcarries\b/i, /\blinks open\b/i, /\bare available\b/i]) {
      expect(tauri).not.toMatch(present);
    }
  });

  it('keeps the desktop entries short of GA while no installer is published', () => {
    expect(noteFor('2026-09-15').maturity).not.toBe('ga');
    expect(noteFor('2026-09-15').body.join(' ')).toContain('no installer has been published yet');
    expect(SURFACE_STATUS.desktop).not.toBe(SURFACE_STATUS.web);
  });
});
