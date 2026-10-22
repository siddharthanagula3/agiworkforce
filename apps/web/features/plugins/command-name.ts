const COMMANDS_SEGMENT = 'commands';
const MARKDOWN_SUFFIX = '.md';
const COMMAND_NAME_SEPARATOR = ':';

export function commandNameFromPath(path: string): string | null {
  if (!path.endsWith(MARKDOWN_SUFFIX)) return null;
  const segments = path.slice(0, -MARKDOWN_SUFFIX.length).split('/');
  const commands = segments.lastIndexOf(COMMANDS_SEGMENT);
  if (commands === -1 || commands === segments.length - 1) return null;
  return segments.slice(commands + 1).join(COMMAND_NAME_SEPARATOR);
}
