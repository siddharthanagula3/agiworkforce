import type { RenderResult } from 'mermaid';

interface MermaidRenderer {
  render(id: string, source: string, container?: Element): Promise<RenderResult>;
}

export async function renderMermaidInOwnedHost(
  mermaid: MermaidRenderer,
  id: string,
  source: string,
  owner: HTMLElement,
): Promise<RenderResult> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  owner.append(host);
  try {
    return await mermaid.render(id, source, host);
  } finally {
    host.remove();
  }
}
