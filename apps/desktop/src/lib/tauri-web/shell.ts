export async function open(url: string): Promise<void> {
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
    return {
      code: 0,
      stdout: '',
      stderr: '',
    };
  }
}
