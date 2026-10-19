export const ASSISTANT_WINDOW_HOST = 'window';
const PANEL_PATH = 'src/side_panel.html';
const WINDOW_WIDTH = 440;
const WINDOW_HEIGHT = 860;

export interface AssistantPanelTarget {
  tabId?: number;
  windowId?: number;
}

export function sidePanelAvailable(): boolean {
  return typeof chrome.sidePanel?.open === 'function';
}

export function assistantWindowUrl(): string {
  return chrome.runtime.getURL(`${PANEL_PATH}?host=${ASSISTANT_WINDOW_HOST}`);
}

export function isAssistantWindowHost(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('host') === ASSISTANT_WINDOW_HOST;
}

async function findAssistantWindow(): Promise<number | undefined> {
  const url = assistantWindowUrl();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
  return windows.find((candidate) => candidate.tabs?.some((tab) => tab.url === url))?.id;
}

async function anchorWindow(windowId?: number): Promise<chrome.windows.Window | undefined> {
  try {
    return typeof windowId === 'number'
      ? await chrome.windows.get(windowId)
      : await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return undefined;
  }
}

export async function openAssistantWindow(windowId?: number): Promise<void> {
  const existing = await findAssistantWindow();
  if (existing !== undefined) {
    await chrome.windows.update(existing, { focused: true });
    return;
  }
  const anchor = await anchorWindow(windowId);
  const placement =
    anchor &&
    typeof anchor.left === 'number' &&
    typeof anchor.top === 'number' &&
    typeof anchor.width === 'number'
      ? {
          left: Math.max(anchor.left, anchor.left + anchor.width - WINDOW_WIDTH),
          top: anchor.top,
          height: anchor.height ?? WINDOW_HEIGHT,
        }
      : { height: WINDOW_HEIGHT };
  await chrome.windows.create({
    url: assistantWindowUrl(),
    type: 'popup',
    width: WINDOW_WIDTH,
    focused: true,
    ...placement,
  });
}

export function openAssistantPanel(target: AssistantPanelTarget): Promise<void> {
  if (sidePanelAvailable()) {
    if (typeof target.tabId === 'number') return chrome.sidePanel.open({ tabId: target.tabId });
    if (typeof target.windowId === 'number')
      return chrome.sidePanel.open({ windowId: target.windowId });
  }
  return openAssistantWindow(target.windowId);
}

export async function assistantHostWindowId(): Promise<number | undefined> {
  if (!isAssistantWindowHost()) return (await chrome.windows.getCurrent()).id;
  return (await anchorWindow())?.id;
}

export async function pageWindowQuery(): Promise<chrome.tabs.QueryInfo> {
  if (!isAssistantWindowHost()) return { currentWindow: true };
  const windowId = await assistantHostWindowId().catch(() => undefined);
  return typeof windowId === 'number'
    ? { windowId }
    : { windowType: 'normal', lastFocusedWindow: true };
}

export async function activePageQuery(): Promise<chrome.tabs.QueryInfo> {
  return { active: true, ...(await pageWindowQuery()) };
}
