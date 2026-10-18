import { invoke } from '../lib/tauri-mock';

export async function exportLocalData(): Promise<string | null> {
  return invoke<string | null>('privacy_export_data');
}

export async function deleteLocalData(): Promise<boolean> {
  return (await invoke<boolean>('privacy_delete_account')) === true;
}
