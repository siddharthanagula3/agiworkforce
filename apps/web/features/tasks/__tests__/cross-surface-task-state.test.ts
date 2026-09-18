import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_TASK_STATE_LABELS } from '@agiworkforce/types';

const FEATURE_ROOT = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The web task list and the VS Code cloud task tree must say the same word for
 * the same state. Both read it from the contracts package, so the way they
 * drift apart is a surface spelling a label for itself; that is what this
 * refuses.
 */
describe('the web task list owns no task-state vocabulary of its own', () => {
  const files = sourceFiles(FEATURE_ROOT);

  it('finds the feature sources it is meant to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(AGENT_TASK_STATE_LABELS))(
    'spells %s nowhere but the contract',
    (_state, label) => {
      for (const file of files) {
        expect(readFileSync(file, 'utf8')).not.toContain(`'${label}'`);
      }
    },
  );

  it('renders the shared tasks page rather than a web-only one', () => {
    const page = readFileSync(path.join(FEATURE_ROOT, 'components', 'TasksPage.tsx'), 'utf8');
    expect(page).toContain("from '@agiworkforce/unified-chat'");
  });

  it('talks to the cloud through the shared run client', () => {
    const client = readFileSync(
      path.join(FEATURE_ROOT, 'services', 'cloud-tasks-client.ts'),
      'utf8',
    );
    expect(client).toContain('createManagedCloudAgentRunClient');
  });
});
