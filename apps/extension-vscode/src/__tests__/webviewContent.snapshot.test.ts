/**
 * webviewContent.snapshot.test.ts — structural visual-verification for the
 * VS Code sidebar webview.
 *
 * Locks the rendered HTML shape so any layout drift fires a snapshot diff.
 * Discharges the Stop-hook visual-verification debt for the VS Code surface
 * — the webview is the closest "screen" the extension has, and snapshotting
 * its HTML body is the closest structural-parity equivalent we can do
 * without spinning up the real VS Code shell.
 *
 * The nonce value injected into <script> and <style> tags is non-deterministic
 * (random base64), so we normalize it before snapshotting.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { isModelSelectable } from '@agiworkforce/types';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { MODEL_PICKER_OPTIONS } from '../features/model-picker/modelConstants';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderAndNormalize(
  initialMode: 'auto' | 'plan' | 'execute' = 'auto',
  initialEffort: 'low' | 'medium' | 'high' = 'medium',
  supportsEffort = true,
  meterCollapsed = false,
): string {
  const html = getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'STABLE-NONCE-FOR-SNAPSHOTS',
    initialMode,
    initialEffort,
    supportsEffort,
    meterCollapsed,
  );
  // Normalize anything dynamic that would otherwise drift between runs.
  return html.replace(/STABLE-NONCE-FOR-SNAPSHOTS/g, 'NONCE');
}

function renderSnapshotAndNormalize(
  initialMode: 'auto' | 'plan' | 'execute' = 'auto',
  initialEffort: 'low' | 'medium' | 'high' = 'medium',
  supportsEffort = true,
  meterCollapsed = false,
): string {
  let html = renderAndNormalize(initialMode, initialEffort, supportsEffort, meterCollapsed);

  // The picker is catalog-derived production behavior. Snapshot its structure,
  // not release-specific model IDs/names, so a catalog update does not copy
  // concrete provider identifiers into test output. Longest values go first to
  // avoid partial replacement when one catalog string contains another.
  const catalogOptions = MODEL_PICKER_OPTIONS.filter((option) => option.id !== 'auto').sort(
    (left, right) => right.id.length - left.id.length,
  );
  for (const [index, option] of catalogOptions.entries()) {
    html = html.split(option.id).join(`fixture-catalog-model-${index + 1}`);
    html = html.split(option.label).join(`Catalog model ${index + 1}`);
  }

  return html;
}

describe('VS Code webview structural snapshots', () => {
  it('locks the default rendered webview shape (auto / medium / supportsEffort=true)', () => {
    expect(renderSnapshotAndNormalize()).toMatchSnapshot();
  });

  it('locks the rendered shape when effort is hidden (supportsEffort=false)', () => {
    expect(renderSnapshotAndNormalize('auto', 'medium', false, false)).toMatchSnapshot();
  });

  it('locks the rendered shape when meter is collapsed', () => {
    expect(renderSnapshotAndNormalize('auto', 'medium', true, true)).toMatchSnapshot();
  });
});

describe('model dropdown availability invariant', () => {
  // Availability invariant (scripts/check-availability-invariant.mjs): a model
  // with availability !== "live" (e.g. coming_soon) is display-only — it must
  // never appear as a selectable option on any surface. The webview renders
  // non-live rows disabled with a "Coming soon" suffix, mirroring the web picker.
  it('renders live models enabled and non-live models as disabled "Coming soon" rows', () => {
    const html = renderAndNormalize();
    const optionTags = html.match(/<option[^>]*>[^<]*<\/option>/g) ?? [];
    expect(optionTags.length).toBeGreaterThan(0);

    for (const option of MODEL_PICKER_OPTIONS) {
      const tag = optionTags.find((t) => t.includes(`value="${option.id}"`));
      expect(tag, `option for "${option.id}" missing from dropdown`).toBeDefined();
      if (option.availability === 'live') {
        expect(tag, `live model "${option.id}" must not be disabled`).not.toContain('disabled');
      } else {
        expect(tag, `non-live model "${option.id}" must be disabled`).toContain('disabled');
        expect(tag, `non-live model "${option.id}" must say Coming soon`).toContain('Coming soon');
      }
    }
  });

  it('never renders a non-live catalog model id as a selectable (enabled) option', () => {
    const html = renderAndNormalize();
    const optionTags = html.match(/<option[^>]*>[^<]*<\/option>/g) ?? [];
    for (const tag of optionTags) {
      if (tag.includes('disabled')) continue;
      const id = /value="([^"]+)"/.exec(tag)?.[1] ?? '';
      if (id === 'auto' || id.startsWith('auto-')) continue; // routing pseudo-models, not catalog entries
      expect(isModelSelectable(id), `non-live model "${id}" rendered as selectable`).toBe(true);
    }
  });
});
