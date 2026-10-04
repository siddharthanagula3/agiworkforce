import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { AgentRunWindow, MemoryWindow, ProjectWindow } from './FeatureScenes';

const LOCAL_RUNTIME_LABEL = `${(CLI_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

const scenes: Array<[string, () => React.ReactElement]> = [
  ['AgentRunWindow', () => <AgentRunWindow />],
  ['MemoryWindow', () => <MemoryWindow />],
  ['ProjectWindow', () => <ProjectWindow />],
];

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

  it('AgentRunWindow receipt names the managed route', () => {
    const text = render(<AgentRunWindow />).container.textContent ?? '';
    expect(text).toContain('Served by AGI Cloud · Auto route');
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
