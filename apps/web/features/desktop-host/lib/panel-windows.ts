'use client';

import { useSyncExternalStore } from 'react';

export type DetachablePanel = 'work' | 'research';

export interface PanelWindowControls {
  detached: boolean;
  onToggle: () => void;
}

const WINDOW_NAME_PREFIX = 'agi-panel-';
const WINDOW_FEATURES = 'popup,width=440,height=760';
const CONTAINER_STYLE = 'display:flex;flex-direction:column;height:100vh';
const RELEASE_GRACE_MS = 2_000;
const WINDOW_TITLES: Readonly<Record<DetachablePanel, string>> = {
  work: 'Details',
  research: 'Research',
};

interface PanelWindow {
  window: Window;
  container: HTMLElement;
  release: () => void;
}

const windows = new Map<DetachablePanel, PanelWindow>();
const pendingCloses = new Map<DetachablePanel, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let containers: ReadonlyMap<DetachablePanel, HTMLElement> = new Map();

function publish(): void {
  containers = new Map([...windows].map(([panel, entry]) => [panel, entry.container]));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isStyleNode(node: Node): node is HTMLLinkElement | HTMLStyleElement {
  if (node.nodeName === 'STYLE') return true;
  return node.nodeName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet';
}

function copyAttributes(from: Element, to: Element): void {
  for (const attribute of Array.from(to.attributes)) {
    if (!from.hasAttribute(attribute.name)) to.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(from.attributes)) {
    to.setAttribute(attribute.name, attribute.value);
  }
}

function mirrorDocument(source: Document, target: Document): () => void {
  const clones = new Map<Node, Node>();
  const add = (node: Node) => {
    if (!isStyleNode(node) || clones.has(node)) return;
    const clone = target.importNode(node, true);
    if (node.nodeName === 'LINK') (clone as HTMLLinkElement).href = (node as HTMLLinkElement).href;
    target.head.appendChild(clone);
    clones.set(node, clone);
  };
  const remove = (node: Node) => {
    const clone = clones.get(node);
    if (!clone) return;
    clone.parentNode?.removeChild(clone);
    clones.delete(node);
  };
  const syncText = (node: Node | null) => {
    const clone = node ? clones.get(node) : undefined;
    if (node && clone) clone.textContent = node.textContent;
  };
  const syncRoot = () => copyAttributes(source.documentElement, target.documentElement);
  const syncBody = () => {
    target.body.className = source.body.className;
  };

  source.head.childNodes.forEach(add);
  syncRoot();
  syncBody();

  const headObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target === source.head) {
        record.addedNodes.forEach(add);
        record.removedNodes.forEach(remove);
      } else {
        syncText(
          record.target.nodeType === Node.TEXT_NODE ? record.target.parentNode : record.target,
        );
      }
    }
  });
  headObserver.observe(source.head, { childList: true, subtree: true, characterData: true });
  const rootObserver = new MutationObserver(syncRoot);
  rootObserver.observe(source.documentElement, { attributes: true });
  const bodyObserver = new MutationObserver(syncBody);
  bodyObserver.observe(source.body, { attributes: true, attributeFilter: ['class'] });

  return () => {
    headObserver.disconnect();
    rootObserver.disconnect();
    bodyObserver.disconnect();
  };
}

export function detachPanel(panel: DetachablePanel): boolean {
  const existing = windows.get(panel);
  if (existing) {
    existing.window.focus();
    return true;
  }
  const child = window.open('', `${WINDOW_NAME_PREFIX}${panel}`, WINDOW_FEATURES);
  if (!child) return false;
  let target: Document;
  try {
    target = child.document;
  } catch {
    child.close();
    return false;
  }

  target.title = WINDOW_TITLES[panel];
  const stopMirroring = mirrorDocument(document, target);
  const container = target.createElement('div');
  container.style.cssText = CONTAINER_STYLE;
  target.body.style.margin = '0';
  target.body.replaceChildren(container);

  const closeChild = () => child.close();
  const release = () => {
    if (windows.get(panel)?.window !== child) return;
    stopMirroring();
    window.removeEventListener('pagehide', closeChild);
    windows.delete(panel);
    publish();
  };
  child.addEventListener('pagehide', release);
  window.addEventListener('pagehide', closeChild);
  windows.set(panel, { window: child, container, release });
  publish();
  return true;
}

export function focusPanelWindow(panel: DetachablePanel): void {
  windows.get(panel)?.window.focus();
}

export function closePanelWindow(panel: DetachablePanel): void {
  const entry = windows.get(panel);
  if (!entry) return;
  entry.release();
  entry.window.close();
}

export function retainPanelWindow(panel: DetachablePanel): () => void {
  const pending = pendingCloses.get(panel);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingCloses.delete(panel);
  }
  return () => {
    pendingCloses.set(
      panel,
      setTimeout(() => {
        pendingCloses.delete(panel);
        closePanelWindow(panel);
      }, RELEASE_GRACE_MS),
    );
  };
}

export function usePanelWindow(panel: DetachablePanel): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => containers.get(panel) ?? null,
    () => null,
  );
}
