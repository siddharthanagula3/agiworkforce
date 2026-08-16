import { getElectronHostBridge } from './bridgeContract';

export async function open(url: string): Promise<void> {
  const host = getElectronHostBridge();
  if (host) {
    await host.openExternal(url);
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export class Command {
  constructor(
    public readonly command: string,
    public readonly args: string[] = [],
  ) {}

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    throw new Error('Shell commands are not available in the AGI cloud desktop app.');
  }
}
