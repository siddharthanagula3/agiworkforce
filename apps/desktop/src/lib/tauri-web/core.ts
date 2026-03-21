export { invoke, isTauri } from '../tauri-mock';

export async function addPluginListener(): Promise<() => void> {
  return () => {};
}
