import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileTree } from '../FileTree';

const invokeCalls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];

vi.mock('../../../utils/ipc', () => ({
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    invokeCalls.push({ command, args });
    if (command === 'dir_list') {
      const path = String(args?.['path'] ?? '');
      if (path.endsWith('/src')) {
        return [
          {
            path: `${path}/main.ts`,
            name: 'main.ts',
            is_file: true,
            is_dir: false,
            size: 10,
            modified: 0,
          },
        ];
      }
      return [
        { path: `${path}/src`, name: 'src', is_file: false, is_dir: true, size: 0, modified: 0 },
        {
          path: `${path}/README.md`,
          name: 'README.md',
          is_file: true,
          is_dir: false,
          size: 5,
          modified: 0,
        },
      ];
    }
    return null;
  }),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  listen: vi.fn(async () => () => {}),
}));

function dirListCalls(): number {
  return invokeCalls.filter((call) => call.command === 'dir_list').length;
}

describe('FileTree root load stability', () => {
  beforeEach(() => {
    invokeCalls.length = 0;
  });

  it('loads the root exactly once and settles (no update-depth loop)', async () => {
    render(<FileTree rootPath="/repo" onFileSelect={vi.fn()} />);

    await screen.findByText('README.md');
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(dirListCalls()).toBe(1);
  });

  it('expanding a folder loads that folder without re-firing the root storm', async () => {
    const user = userEvent.setup();
    render(<FileTree rootPath="/repo" onFileSelect={vi.fn()} />);
    await screen.findByText('src');
    const before = dirListCalls();

    await user.click(screen.getByText('src'));
    await screen.findByText('main.ts');
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(dirListCalls() - before).toBeLessThanOrEqual(2);
  });
});
