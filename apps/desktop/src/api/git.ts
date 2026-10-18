import { invoke } from '../lib/tauri-mock';

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
}

export async function gitStatus(path: string): Promise<GitStatus> {
  try {
    return await invoke<GitStatus>('git_status', { path });
  } catch (err) {
    throw new Error(`git status failed: ${err}`);
  }
}
