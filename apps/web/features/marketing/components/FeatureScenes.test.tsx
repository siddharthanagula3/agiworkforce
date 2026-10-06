import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getToolDisplayLabel,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_STATUS_PRESENTATION,
} from '@agiworkforce/types';
import { e2bExecutionToolDefs, WRITE_FILE_TOOL } from '@/lib/e2b/execution-tools';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { AgentRunWindow, ConsoleWindow, MemoryWindow, ProjectWindow } from './FeatureScenes';

const LOCAL_RUNTIME_LABEL = `${(CLI_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

const scenes: Array<[string, () => React.ReactElement]> = [
  ['AgentRunWindow', () => <AgentRunWindow />],
  ['MemoryWindow', () => <MemoryWindow />],
  ['ProjectWindow', () => <ProjectWindow />],
];

describe('existing console scene rendering', () => {
  it.each(['members', 'policy', 'usage', 'audit'] as const)(
    'renders the %s view in initial server markup',
    (view) => {
      const markup = document.createElement('div');
      markup.innerHTML = renderToStaticMarkup(<ConsoleWindow view={view} />);
      expect(markup.querySelector('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
      expect(markup.querySelector('.agi-sc-page-title')?.textContent?.toLowerCase()).toBe(view);
      if (view === 'policy') {
        const permissions = [...markup.querySelectorAll('.agi-sc-perm')];
        expect(permissions.length).toBeGreaterThan(0);
        for (const permission of permissions) {
          expect(permission.querySelector('.agi-sc-meta')?.textContent?.trim()).toBe(
            permission.getAttribute('data-state'),
          );
        }
      }
    },
  );
});

describe('web approval request illustration', () => {
  it('shows an explicitly pending example with the real file-write argument schema', () => {
    const markup = document.createElement('div');
    markup.innerHTML = renderToStaticMarkup(<AgentRunWindow />);
    const text = markup.textContent ?? '';
    expect(text).toContain('Example · Web approval request');
    expect(text).toContain(TOOL_STATUS_PRESENTATION['awaiting-approval'].label);
    expect(text).toContain('No file has been written.');
    expect(text).toContain('Sandbox tools must be enabled and available.');
    expect(text).toContain(getToolDisplayLabel(WRITE_FILE_TOOL).displayName);
    const code = markup.querySelector('pre code');
    expect(code).not.toBeNull();
    const args = JSON.parse(code!.textContent ?? '') as Record<string, unknown>;
    const definition = e2bExecutionToolDefs().find(
      (tool) => tool.function.name === WRITE_FILE_TOOL,
    );
    expect(definition).toBeDefined();
    const schema = definition!.function.parameters;
    expect(Object.keys(args).sort()).toEqual((schema['required'] as string[]).toSorted());
    expect(args['path']).toBe('report.txt');
    expect(args['content']).toBe('Notes for the project report.');
    const properties = schema['properties'] as Record<string, { type: string }>;
    for (const key of schema['required'] as string[]) {
      expect(typeof args[key]).toBe(properties[key]?.type);
    }
  });

  it('shows canonical approval choices without invented activity or global permission promises', () => {
    const { container } = render(<AgentRunWindow />);
    expect(
      [...container.querySelectorAll('.agi-mk-actions > span')].map((choice) => choice.textContent),
    ).toEqual([TOOL_APPROVAL_ACTION_LABELS.allow, TOOL_APPROVAL_ACTION_LABELS.deny]);
    expect(container.querySelector('.agi-mk-receipt')).toBeNull();
    expect(container.textContent).not.toMatch(
      /Plan · \d|\d+(?:\.\d+)? s|\+\d|Nothing on this list|Network|git push|pull request|Always/u,
    );
  });

  it('keeps the illustrative approval controls static in the initial server markup', () => {
    const markup = document.createElement('div');
    markup.innerHTML = renderToStaticMarkup(<AgentRunWindow />);
    expect(markup.querySelectorAll('button,a,input,select,textarea,[tabindex]')).toHaveLength(0);
    expect(markup.querySelector('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('web feature scenes never render a Local route', () => {
  it.each(scenes)('%s has no Local route text and no Local badge', (_name, make) => {
    const { container } = render(make());
    const text = container.textContent ?? '';
    expect(text).not.toContain('Served by Local');
    expect(text).not.toContain(LOCAL_RUNTIME_LABEL);
    expect(text).not.toContain('stays on this device');
    expect(text).not.toContain('Local and Cloud allowed');
    expect(container.querySelector('.agi-dev-badge')?.textContent).not.toBe('Local');
  });

  it('AgentRunWindow identifies Web without implying a completed model route', () => {
    const { container } = render(<AgentRunWindow />);
    expect(container.querySelector('.agi-dev-badge')).toHaveTextContent('Web');
    expect(container.textContent).toContain(TOOL_STATUS_PRESENTATION['awaiting-approval'].label);
    expect(container.textContent).not.toContain('Served by');
  });

  it('MemoryWindow says memory is saved to the account', () => {
    const text = render(<MemoryWindow />).container.textContent ?? '';
    expect(text).toContain('On · saved to your account');
  });
});

describe('enforcement anchors for the cloud-only claim', () => {
  const root = resolve(__dirname, '../../../../..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

  it.each([
    ['apps/desktop/electron/config.ts', 'This shell has no Local mode'],
    ['apps/desktop/electron/runtime/dispatcher.ts', 'localModels: false'],
    [
      'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts',
      'MANAGED_WEB_CLOUD_TRUST_MODE',
    ],
    ['apps/extension/src/background.ts', 'executeChromeManagedChat'],
  ])('%s still contains %s', (path, needle) => {
    expect(read(path)).toContain(needle);
  });
});
