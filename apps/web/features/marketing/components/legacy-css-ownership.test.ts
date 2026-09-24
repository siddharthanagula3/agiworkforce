import fs from 'node:fs';
import path from 'node:path';

import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

function atRuleContext(rule: Rule): string {
  const context: string[] = [];
  let parent = rule.parent;

  while (parent?.type !== 'root') {
    if (parent?.type === 'atrule') context.unshift(`@${parent.name} ${parent.params}`);
    parent = parent?.parent;
  }

  return context.join(' > ');
}

function flagshipSelectorOwners(file: string): Map<string, number> {
  const source = fs.readFileSync(file, 'utf8');
  const owners = new Map<string, number>();

  postcss.parse(source).walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!selector.includes('.agi-fl-')) continue;
      owners.set(`${atRuleContext(rule)} :: ${selector}`, rule.source?.start?.line ?? 0);
    }
  });

  return owners;
}

function subEyebrowType(file: string): { line: number; value: string }[] {
  const source = fs.readFileSync(file, 'utf8');
  const declarations: { line: number; value: string }[] = [];

  postcss.parse(source).walkDecls('font-size', (declaration) => {
    const match = /^(\d+(?:\.\d+)?)px$/.exec(declaration.value);
    if (!match || Number(match[1]) >= 11) return;
    declarations.push({
      line: declaration.source?.start?.line ?? 0,
      value: declaration.value,
    });
  });

  return declarations;
}

describe('legacy flagship stylesheet ownership', () => {
  it('keeps each flagship selector and responsive context in one stylesheet', () => {
    const styles = path.resolve(process.cwd(), 'features/marketing/components');
    const pages = flagshipSelectorOwners(path.join(styles, 'legacy-pages.css'));
    const landing = flagshipSelectorOwners(path.join(styles, 'legacy-landing.css'));
    const duplicates = [...landing.entries()]
      .filter(([key]) => pages.has(key))
      .map(([key, landingLine]) => ({
        key,
        pagesLine: pages.get(key),
        landingLine,
      }));

    expect(duplicates).toEqual([]);
  });

  it('keeps every marketing stylesheet at or above the 11px eyebrow floor', () => {
    const styles = path.resolve(process.cwd(), 'features/marketing/components');
    const files = [
      path.join(styles, 'legacy-pages.css'),
      path.join(styles, 'legacy-landing.css'),
      path.join(styles, 'system/system.css'),
    ];

    expect(files.flatMap(subEyebrowType)).toEqual([]);
  });
});
