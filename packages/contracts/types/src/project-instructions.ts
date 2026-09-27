export const PROJECT_INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agiworkforce/instructions.md',
] as const;

export type ProjectInstructionFile = (typeof PROJECT_INSTRUCTION_FILES)[number];

export const PROJECT_INSTRUCTION_MAX_SOURCES = 2;
export const PROJECT_INSTRUCTION_MAX_CHARS = 8_192;

export interface ProjectInstruction {
  fileName: ProjectInstructionFile;
  content: string;
  truncated: boolean;
}

export function projectInstruction(
  fileName: ProjectInstructionFile,
  raw: string,
): ProjectInstruction | null {
  if (raw.trim().length === 0) return null;
  const truncated = raw.length > PROJECT_INSTRUCTION_MAX_CHARS;
  return {
    fileName,
    truncated,
    content: truncated
      ? `${raw.slice(0, PROJECT_INSTRUCTION_MAX_CHARS)}\n\n[...truncated, file is ${raw.length} chars, showing first ${PROJECT_INSTRUCTION_MAX_CHARS}]`
      : raw,
  };
}
