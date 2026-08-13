export function buildExtensionStatusBarText(model: string, mode: string): string {
  const chips: string[] = [];
  if (mode !== 'auto') chips.push(mode);

  return chips.length > 0
    ? `$(hubot) AGI: ${model} · ${chips.join(' · ')}`
    : `$(hubot) AGI: ${model}`;
}
