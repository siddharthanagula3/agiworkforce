import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { agentConfigPath, openAgentConfig } from '../features/config/agentConfig';

describe('agent configuration path', () => {
  it('resolves the CLI-owned config file from the active extension-host home directory', () => {
    expect(agentConfigPath('/host-home')).toBe(
      path.join('/host-home', '.agiworkforce', 'config.toml'),
    );
  });

  it('creates a private file when needed and opens it without truncating existing config', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const fileSystem = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue({ close }),
    };

    const openedPath = await openAgentConfig({
      homeDirectory: '/host-home',
      fileSystem,
    });

    expect(fileSystem.mkdir).toHaveBeenCalledWith(path.join('/host-home', '.agiworkforce'), {
      recursive: true,
      mode: 0o700,
    });
    expect(fileSystem.open).toHaveBeenCalledWith(openedPath, 'a', 0o600);
    expect(close).toHaveBeenCalledOnce();
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(vscode.Uri.file(openedPath));
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(expect.anything(), {
      preview: false,
    });
  });
});
