export function buildExtensionStatusBarText(
  model: string,
  mode: string,
  mcpEnabled: boolean,
): string {
  const chips: string[] = [];
  if (mode !== 'auto') chips.push(mode);
  if (mcpEnabled) chips.push('mcp');

  return chips.length > 0
    ? `$(hubot) AGI: ${model} · ${chips.join(' · ')}`
    : `$(hubot) AGI: ${model}`;
}
