const PATH_SEPARATOR = '/';
const SKILL_ARCHIVE_EXTENSIONS = ['.zip', '.skill'] as const;

export const SKILL_UPLOAD_AT_ARCHIVE_ROOT_MESSAGE =
  'SKILL.md is at the top of the zip instead of inside a skill folder. Zip the skill folder itself, not the files in it, so the zip holds <skill-name>/SKILL.md.';

export function skillUploadNestedMessage(archivePath: string): string {
  return `SKILL.md must sit directly inside the skill folder at the top of the zip, as <skill-name>/SKILL.md. This zip has it at ${archivePath}.`;
}

export function skillUploadFolderMismatchMessage(folder: string, name: string): string {
  return `The folder "${folder}" does not match the skill name "${name}" in SKILL.md. Give the folder and the name the same value, then zip the folder again.`;
}

export function namesSkillArchive(fileName: string | undefined): boolean {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return SKILL_ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function skillArchiveFolder(archivePath: string): { folder: string } | { problem: string } {
  const segments = archivePath.split(PATH_SEPARATOR);
  if (segments.length === 1) return { problem: SKILL_UPLOAD_AT_ARCHIVE_ROOT_MESSAGE };
  if (segments.length > 2) return { problem: skillUploadNestedMessage(archivePath) };
  return { folder: segments[0]! };
}
