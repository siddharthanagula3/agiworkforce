import { getToolDisplayInfo } from './toolDisplayNames';
import { decodeCompositeToolName } from './toolNameEncoding';

export const normalizeToolNameForUi = (toolName: string): string => {
  let name = toolName;
  if (name.startsWith('__server__')) {
    name = name.slice('__server__'.length) || name;
  }

  return decodeCompositeToolName(name);
};

export const toolNameToTitle = (toolName: string): string => {
  const normalizedToolName = normalizeToolNameForUi(toolName);
  const displayInfo = getToolDisplayInfo(normalizedToolName);
  if (displayInfo.displayName !== 'Working') {
    return displayInfo.displayName;
  }
  return normalizedToolName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};
