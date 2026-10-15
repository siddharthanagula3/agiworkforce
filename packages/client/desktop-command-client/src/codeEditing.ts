import { command } from '@agiworkforce/client-runtime';

export async function codingCheckpointRewind(id: string): Promise<string[]> {
  return command<string[]>('coding_checkpoint_rewind', { id });
}
