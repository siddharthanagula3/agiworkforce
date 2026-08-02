import type { WebMCPToolInfo } from '../../types';
import { normalizeWebMCPPageUrl, normalizeWebMCPToolsUpdate } from '../../background/policy';

export interface ActiveWebMCPPageIdentity {
  tabId: number;
  url: string;
  /** Side-panel-local epoch incremented for every observed URL change. */
  pageGeneration: number;
}

export interface DisplayWebMCPTool {
  name: string;
  description: string;
}

export function createActiveWebMCPPageIdentity(
  tabId: unknown,
  url: unknown,
  pageGeneration: unknown,
): ActiveWebMCPPageIdentity | null {
  const normalizedUrl = normalizeWebMCPPageUrl(url);
  return typeof tabId === 'number' &&
    Number.isSafeInteger(tabId) &&
    tabId >= 0 &&
    typeof pageGeneration === 'number' &&
    Number.isSafeInteger(pageGeneration) &&
    pageGeneration >= 0 &&
    normalizedUrl
    ? { tabId, url: normalizedUrl, pageGeneration }
    : null;
}

export function isWebMCPUpdateHintForActivePage(
  message: unknown,
  activePage: ActiveWebMCPPageIdentity | null,
): boolean {
  if (!activePage || !message || typeof message !== 'object' || Array.isArray(message))
    return false;
  const record = message as Record<string, unknown>;
  return record['tabId'] === activePage.tabId && record['url'] === activePage.url;
}

/**
 * Accept a discovery update only when its privileged sender identity matches
 * the exact active tab currently represented by this side panel.
 */
export function selectWebMCPToolsForActivePage(
  message: unknown,
  activePage: ActiveWebMCPPageIdentity | null,
): DisplayWebMCPTool[] | null {
  if (!activePage || !message || typeof message !== 'object' || Array.isArray(message)) return null;
  const record = message as Record<string, unknown>;
  if (
    record['tabId'] !== activePage.tabId ||
    record['url'] !== activePage.url ||
    record['pageGeneration'] !== activePage.pageGeneration
  ) {
    return null;
  }
  const normalized = normalizeWebMCPToolsUpdate(record['tools'], record['url'], activePage.url);
  if (!normalized || normalized.url !== activePage.url) return null;
  return normalized.tools.map((tool: WebMCPToolInfo) => ({
    name: tool.name,
    description: tool.description,
  }));
}
