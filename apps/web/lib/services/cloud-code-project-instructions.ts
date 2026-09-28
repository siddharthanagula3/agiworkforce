import 'server-only';

import {
  PROJECT_INSTRUCTION_FILES,
  PROJECT_INSTRUCTION_MAX_SOURCES,
  projectInstruction,
  type ProjectInstruction,
} from '@agiworkforce/types';
import type { E2BExecutor, SandboxFileEntry } from '@/lib/e2b/types';

type SandboxListing = (directory: string) => Promise<SandboxFileEntry[] | null>;

async function hasFile(list: SandboxListing, root: string, relativePath: string): Promise<boolean> {
  const segments = relativePath.split('/');
  let directory = root;
  for (const [index, segment] of segments.entries()) {
    const entry = (await list(directory))?.find((candidate) => candidate.name === segment);
    if (!entry) return false;
    if (index === segments.length - 1) return !entry.isDir;
    if (!entry.isDir) return false;
    directory = `${directory}/${segment}`;
  }
  return false;
}

export async function readCloudCodeProjectInstructions(
  executor: Pick<E2BExecutor, 'listFiles' | 'readFileBytes'>,
  workspacePath: string,
): Promise<ProjectInstruction[]> {
  if (!executor.listFiles || !executor.readFileBytes) return [];
  const listFiles = executor.listFiles.bind(executor);
  const readFileBytes = executor.readFileBytes.bind(executor);
  const listings = new Map<string, Promise<SandboxFileEntry[] | null>>();
  const list: SandboxListing = (directory) => {
    const cached = listings.get(directory);
    if (cached) return cached;
    const listing = listFiles(directory);
    listings.set(directory, listing);
    return listing;
  };

  const decoder = new TextDecoder();
  const found: ProjectInstruction[] = [];
  for (const fileName of PROJECT_INSTRUCTION_FILES) {
    if (found.length >= PROJECT_INSTRUCTION_MAX_SOURCES) break;
    if (!(await hasFile(list, workspacePath, fileName))) continue;
    const bytes = await readFileBytes(`${workspacePath}/${fileName}`);
    if (!bytes) continue;
    const instruction = projectInstruction(fileName, decoder.decode(bytes));
    if (instruction) found.push(instruction);
  }
  return found;
}
