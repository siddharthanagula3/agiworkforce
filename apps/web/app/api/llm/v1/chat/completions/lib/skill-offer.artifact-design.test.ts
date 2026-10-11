import {
  EXPLICIT_ARTIFACT_MARKERS,
  extractArtifactTitle,
  extractCodeBlocks,
  isExplicitlyRenderableArtifact,
} from '@agiworkforce/artifacts';
import type { Skill } from '@agiworkforce/skills';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  getManagedSkillCatalog,
  invalidateManagedSkillCatalogCache,
} from '@/lib/services/skill-catalog-service';

import { selectOfferedSkills } from './skill-offer';

const ARTIFACT_DESIGN_SKILL = 'artifact-design';
const MARKER_LINE = /^- Put the artifact marker[^\n]*$/m;
const INLINE_CODE = /`([^`]+)`/g;

let catalog: Skill[];
let artifactDesign: Skill;

beforeAll(async () => {
  invalidateManagedSkillCatalogCache();
  catalog = await getManagedSkillCatalog();
  const found = catalog.find((skill) => skill.name === ARTIFACT_DESIGN_SKILL);
  if (!found) throw new Error(`${ARTIFACT_DESIGN_SKILL} is not in the product skill catalog`);
  artifactDesign = found;
});

function offeredNames(prompt: string): string[] {
  return selectOfferedSkills(catalog, prompt).map((skill) => skill.name);
}

describe('artifact-design skill offer', () => {
  it.each([
    'make a calculator',
    'Make a pomodoro timer',
    'build a todo app',
    'create a snake game',
    'design a landing page for my bakery',
    'can you make me a tic tac toe game?',
    'build an interactive dashboard for my monthly budget',
  ])('offers the skill for "%s"', (prompt) => {
    expect(offeredNames(prompt)).toContain(ARTIFACT_DESIGN_SKILL);
  });

  it.each([
    'what time is it in tokyo right now',
    'summarize this article in three bullets',
    'write a cover letter for a product manager role',
    'make a plan for my week',
    'build a REST API in Go',
    'translate this paragraph into French',
  ])('does not offer the skill for "%s"', (prompt) => {
    expect(offeredNames(prompt)).not.toContain(ARTIFACT_DESIGN_SKILL);
  });
});

describe('artifact-design skill content', () => {
  it('names only markers the artifact derivation accepts', () => {
    const line = MARKER_LINE.exec(artifactDesign.body)?.[0];
    expect(line).toBeDefined();
    const named = [...(line ?? '').matchAll(INLINE_CODE)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const marker of named) {
      expect(EXPLICIT_ARTIFACT_MARKERS).toContain(marker);
    }
  });

  it('produces blocks the explicit derivation policy renders when followed as written', () => {
    const html = [
      '```html',
      '<!-- @artifact -->',
      '<!doctype html><html><head><title>Desk Calculator</title></head><body></body></html>',
      '```',
    ].join('\n');
    const jsx = [
      '```jsx',
      '// @artifact',
      '// @title: Desk Calculator',
      'function App() { return <main />; }',
      '```',
    ].join('\n');

    for (const source of [html, jsx]) {
      const [block] = extractCodeBlocks(source);
      expect(block).toBeDefined();
      expect(isExplicitlyRenderableArtifact(block!.language, block!.content)).toBe(true);
      expect(extractArtifactTitle(block!.content)).toBe('Desk Calculator');
    }
  });
});
