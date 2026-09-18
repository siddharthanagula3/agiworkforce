import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { modelsCatalogJson } from '@agiworkforce/types';

import { RELEASES } from '@/lib/changelog-entries';
import { SURFACE_STATUS } from '@/lib/surface-status';
import { RELEASED_DOC_PLATFORMS } from '@/lib/support/doc-metadata';
import { RELEASE_NOTES, RELEASE_STATE_DATES, releaseStateLine } from '../release-notes-data';

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
    expect(releaseStateLine(noteFor('2026-09-05'))).toBe('GA · Web');
    expect(releaseStateLine(noteFor('2026-02 to 2026-05'))).toBe('Alpha · Desktop');
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
    for (const runtime of ['Ollama', 'LM Studio', 'llama.cpp', 'vLLM']) {
      expect(body, `${runtime} is not in the release note`).toContain(runtime);
      expect(localProviderLabels, `${runtime} is not a catalogued local provider`).toContain(
        runtime,
      );
    }
  });

  it('counts the surfaces the fail-closed egress entry claims', () => {
    const note = noteFor('2026-06-24');
    expect(note.body.join(' ')).toContain('all six surfaces');
    expect(Object.keys(SURFACE_STATUS).length).toBe(6);
    expect(note.surfaces.length).toBe(6);
  });

  it('keeps the CLI v1.0 release short of GA while the installer refuses that release', () => {
    const note = noteFor('2026-05-03');
    expect(note.maturity).not.toBe('ga');
    expect(repoText('scripts', 'install.sh')).toContain(
      'Release signature metadata is missing; refusing to install unverified bytes',
    );
  });

  it('keeps the desktop entries short of GA while no installer is published', () => {
    expect(noteFor('2026-09-15').maturity).not.toBe('ga');
    expect(noteFor('2026-09-15').body.join(' ')).toContain('no installer has been published yet');
    expect(SURFACE_STATUS.desktop).not.toBe(SURFACE_STATUS.web);
  });
});
