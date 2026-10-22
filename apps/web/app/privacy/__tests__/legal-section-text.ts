const BREAKING = new Set(['BR', 'LI', 'TR', 'TD', 'TH', 'P', 'H2', 'UL', 'TABLE']);

function isBreaking(element: Element): boolean {
  return (
    BREAKING.has(element.tagName) ||
    element.classList.contains('agi-ds-ledger-label') ||
    element.classList.contains('agi-ds-ledger-value')
  );
}

function collect(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent ?? '');
    return;
  }
  if (!(node instanceof Element) || node.tagName === 'CAPTION') return;
  const breaking = isBreaking(node);
  if (breaking) out.push(' ');
  if (node.tagName === 'A') out.push(` [${node.getAttribute('href')}] `);
  for (const child of Array.from(node.childNodes)) collect(child, out);
  if (breaking) out.push(' ');
}

export function sectionWords(section: Element): string[] {
  const out: string[] = [];
  collect(section, out);
  return out.join('').split(/\s+/u).filter(Boolean);
}
