import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { getModelMetrics, ModelMetricsPanel } from '../features/model-picker/modelMetrics';

function openDashboard(): (message: { type: string }) => Promise<void> | void {
  let handler: ((message: { type: string }) => Promise<void> | void) | undefined;
  vi.mocked(vscode.window.createWebviewPanel).mockReturnValueOnce({
    webview: {
      html: '',
      onDidReceiveMessage: (listener: (message: { type: string }) => Promise<void> | void) => {
        handler = listener;
        return { dispose: vi.fn() };
      },
    },
    onDidDispose: vi.fn(),
    reveal: vi.fn(),
    dispose: vi.fn(),
  } as never);
  const context = new (
    vscode as unknown as { ExtensionContext: new () => vscode.ExtensionContext }
  ).ExtensionContext();
  ModelMetricsPanel.createOrShow(vscode.Uri.file('/mock/extension'), context);
  if (handler === undefined) throw new Error('the dashboard registered no message handler');
  return handler;
}

describe('model dashboard reset', () => {
  beforeEach(() => {
    ModelMetricsPanel.currentPanel = undefined;
    getModelMetrics().reset();
    getModelMetrics().recordRequest('family-a', 120);
    vi.mocked(vscode.window.showWarningMessage).mockReset();
  });

  it('keeps the recorded metrics when the reader does not confirm the reset', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);
    const send = openDashboard();

    await send({ type: 'reset' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('cannot be recovered'),
      expect.objectContaining({ modal: true }),
      'Reset',
    );
    expect(getModelMetrics().getEntries()).toHaveLength(1);
  });

  it('clears the metrics once the reader confirms', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Reset' as never);
    const send = openDashboard();

    await send({ type: 'reset' });

    expect(getModelMetrics().getEntries()).toHaveLength(0);
  });
});
