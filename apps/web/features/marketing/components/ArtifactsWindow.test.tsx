import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  artifactInclusionForPolicy,
  createArtifactStore,
  deriveArtifacts,
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
} from '@agiworkforce/artifacts';
import { ArtifactsWindow } from './FeatureScenes';

const include = artifactInclusionForPolicy(EXPLICIT_ARTIFACT_DERIVATION_POLICY);

function renderedExample() {
  const markup = document.createElement('div');
  markup.innerHTML = renderToStaticMarkup(<ArtifactsWindow />);
  const code = markup.querySelector('pre code');
  expect(code, 'The example must expose its actual HTML source').not.toBeNull();
  if (!code) throw new Error('Artifact illustration source is missing');
  return { markup, source: code.textContent ?? '' };
}

function fenced(source: string) {
  return ['```html', source, '```'].join('\n');
}

function panelSource(source: string) {
  const parsed = ts.createSourceFile(
    'ArtifactPreview.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const panels: ts.IfStatement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && node.expression.getText(parsed) === "variant === 'panel'")
      panels.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  expect(panels).toHaveLength(1);
  const panel = panels[0];
  if (!panel) throw new Error('Artifact panel branch is missing');
  return panel.thenStatement.getText(parsed);
}

describe('web artifact preview illustration', () => {
  it('keeps the displayed source, preview and initial history consistent with canonical derivation', () => {
    const { markup, source } = renderedExample();
    const derived = deriveArtifacts(fenced(source), { include });
    expect(derived).toHaveLength(1);
    const artifact = derived[0];
    if (!artifact) throw new Error('The displayed source does not derive an artifact');
    expect(artifact.type).toBe('html');
    expect(artifact.language).toBe('html');
    expect(artifact.content).toBe(source.trim());
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    expect(parsed.querySelector('h1')).not.toBeNull();
    expect(parsed.querySelector('p')).not.toBeNull();
    expect(artifact.title).toBe(parsed.title);
    expect(markup.querySelector('.agi-sc-artifact-preview .agi-sc-doc-title')?.textContent).toBe(
      parsed.querySelector('h1')?.textContent,
    );
    expect(markup.querySelector('.agi-sc-artifact-preview p')?.textContent).toBe(
      parsed.querySelector('p')?.textContent,
    );
    expect(markup.querySelector('.agi-sc-artifact-title')?.textContent).toBe(artifact.title);
    const store = createArtifactStore();
    store.getState().upsertArtifact(artifact);
    const history = store.getState().getArtifactVersions(artifact.id);
    expect(history).toHaveLength(1);
    expect(markup.querySelector('.agi-sc-tabs--versions')?.textContent).toBe(
      `v${artifact.version}/${history.length}`,
    );
    expect(markup.textContent).toContain('Example · Web HTML artifact');
    expect(markup.textContent).toContain('Illustration source');
    const tabs = [...markup.querySelectorAll('.agi-sc-tabs:not(.agi-sc-tabs--versions) > span')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Preview', 'Source']);
    expect(tabs[0]).toHaveAttribute('data-on', 'true');
    expect(tabs[1]).not.toHaveAttribute('data-on');
    expect(
      [...markup.querySelectorAll('.agi-sc-panel-foot > span')].map((item) => item.textContent),
    ).toEqual(['Copy', `Download source (.${artifact.language})`, 'Save to Library']);
    const viewer = panelSource(
      readFileSync(
        resolve(__dirname, '../../chat/components/artifacts/ArtifactPreview.tsx'),
        'utf8',
      ),
    );
    expect(viewer).toContain('aria-label="Preview"');
    expect(viewer).toContain('aria-label="Source"');
    expect(viewer).toContain('title="Copy"');
    expect(viewer).toContain('title="Save to Library"');
    expect(viewer).toContain("Download source (.{(artifact.language || 'txt').toLowerCase()})");
    expect(markup.querySelector('.agi-mk-receipt')).toBeNull();
    expect(markup.textContent).not.toMatch(
      /Read \d+ files|\d[,.]\d+ words|\d+(?:\.\d+)? s|Saved to/u,
    );
    expect(markup.querySelector('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
    expect(markup.querySelectorAll('button,a,input,select,textarea,[tabindex]')).toHaveLength(0);
  });

  it('requires the explicit marker while retaining a valid renderable HTML example', () => {
    const { source } = renderedExample();
    expect(source).toContain('<!-- @artifact -->');
    const unmarked = source.replace('<!-- @artifact -->', '');
    expect(deriveArtifacts(fenced(unmarked), { include: 'renderable' })).toHaveLength(1);
    expect(deriveArtifacts(fenced(unmarked), { include })).toEqual([]);
  });
});
