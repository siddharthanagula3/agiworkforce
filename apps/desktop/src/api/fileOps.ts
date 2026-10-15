import { invoke } from '../lib/tauri-mock';

export async function fileOpenWithDefaultApp(path: string): Promise<void> {
  try {
    await invoke('file_open_with_default_app', { path });
  } catch (error) {
    throw new Error(`fileOpenWithDefaultApp failed: ${error}`);
  }
}
