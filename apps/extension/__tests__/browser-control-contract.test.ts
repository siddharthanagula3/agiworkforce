/**
 * The standing promises browser control makes, as assertions rather than prose.
 *
 * One agent drives the page and it declares exactly the tools it can dispatch;
 * it addresses elements structurally before it falls back to pixels; it has no
 * way to put a file into a page; and every way a run can be ended has something
 * that ends it.
 *
 * @vitest-environment jsdom
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { approvalRequirement } from '../src/features/computer-use/approvalPolicy';
import { describeComputerUseAction } from '../src/features/computer-use/describeAction';
import { BROWSER_TOOL_DEFINITIONS } from '../src/features/computer-use/cloudAgentClient';
import { describeCancellationReason } from '../src/features/side-panel/computerUsePanel';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(root: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|js)$/u.test(entry.name) && !/\.d\.ts$/u.test(entry.name)) {
        out.push({ path: relative(APP_ROOT, full), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(join(APP_ROOT, root));
  return out;
}

const SOURCES = sourceFiles('src');

const TOOL_NAMES = BROWSER_TOOL_DEFINITIONS.map((definition) => definition.function.name);

const UNDESCRIBED_ACTION_HINT = 'This action is not one AGI can describe in detail';

describe('one agent, one set of tools', () => {
  it('can describe every tool it offers the model, so the two lists cannot drift', () => {
    const undescribed = TOOL_NAMES.filter((name) =>
      describeComputerUseAction(name, {}).includes(UNDESCRIBED_ACTION_HINT),
    );

    expect(undescribed).toEqual([]);
  });

  it('falls back to a warning for a name it does not offer', () => {
    expect(describeComputerUseAction('exfiltrate', {})).toContain(UNDESCRIBED_ACTION_HINT);
  });

  it('runs the page from a single loop, with no second agent module beside it', () => {
    const loops = SOURCES.filter((source) =>
      source.text.includes('export async function runAgentLoop'),
    );

    expect(loops.map((source) => source.path)).toEqual(['src/features/computer-use/agentLoop.ts']);
  });
});

describe('addressing an element', () => {
  it.each(['click', 'type'])('%s offers a structural index, marked preferred', (name) => {
    const definition = BROWSER_TOOL_DEFINITIONS.find((entry) => entry.function.name === name);
    const index = definition?.function.parameters.properties['index'];

    expect(index?.type).toBe('number');
    expect(index?.description).toContain('PREFERRED');
  });

  it('tells the model to re-read the page rather than reuse a stale index', () => {
    const click = BROWSER_TOOL_DEFINITIONS.find((entry) => entry.function.name === 'click');

    expect(click?.function.parameters.properties['index']?.description).toMatch(/read_dom/);
  });
});

describe('putting a file into a page', () => {
  it('has no driver command that can set a file input', () => {
    for (const source of SOURCES) {
      expect(source.text, `${source.path} can set a file input`).not.toContain(
        'DOM.setFileInputFiles',
      );
    }
  });

  it('treats any click or type on a file input as something to ask about', () => {
    for (const toolName of ['click', 'type']) {
      expect(
        approvalRequirement({
          toolName,
          args: {},
          pageUrl: 'https://example.com/apply',
          targetSignature: 'input||file|resume|Upload your resume',
        }),
      ).toEqual({ alwaysAsk: true, reason: 'upload' });
    }
  });

  it('skips a file field during autofill instead of pretending it filled it', () => {
    const filler = readFileSync(join(APP_ROOT, 'src/features/content/autofill/filler.ts'), 'utf8');

    expect(filler).toContain("field.fieldType === 'file'");
    expect(filler).toContain('FILE_INPUT_SKIP_REASON');
  });
});

describe('every way a run can end has something that ends it', () => {
  const REASONS = [
    'account_changed',
    'debugger_detached',
    'panel_closed',
    'superseded',
    'tab_intent_changed',
    'tab_removed',
    'user_cleared',
    'user_stopped',
  ] as const;

  it('lists exactly the reasons the ownership module declares', () => {
    const declared = readFileSync(
      join(APP_ROOT, 'src/features/computer-use/runOwnership.ts'),
      'utf8',
    );
    const union = /export type ComputerUseCancellationReason =([^;]+);/u.exec(declared)?.[1] ?? '';
    const names = [...union.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]);

    expect(names).toEqual([...REASONS]);
  });

  const DECLARATION = 'src/features/computer-use/runOwnership.ts';
  const COPY = 'src/features/side-panel/computerUsePanel.ts';

  it.each(REASONS)('%s is raised somewhere other than where it is declared', (reason) => {
    const producers = SOURCES.filter((source) => {
      if (source.path === DECLARATION) {
        return (
          source.text.includes(`this.cancel('${reason}')`) ||
          source.text.includes(`ComputerUseRunCancelledError('${reason}')`)
        );
      }
      return source.text.includes(`'${reason}'`);
    }).map((source) => source.path);

    expect(
      producers.filter((path) => path !== COPY),
      `nothing raises ${reason}`,
    ).not.toEqual([]);
  });

  it.each(REASONS)('%s is explained to the reader rather than shown as a code', (reason) => {
    const sentence = describeCancellationReason(reason);
    expect(sentence, `no sentence for ${reason}`).toBeTruthy();
    expect(sentence).not.toContain(reason);
  });
});
