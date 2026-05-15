/**
 * Lucide SVG paths for Chrome extension use.
 * All icons: viewBox 0 0 24 24, stroke-only, stroke-width 1.75, stroke-linecap round, stroke-linejoin round.
 * No React deps — raw SVG strings rendered via DOM/innerHTML (sanitized).
 * Source: lucide.dev — each path verified against Lucide 0.x canonical paths.
 */

const ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

function svg(inner: string): string {
  return `<svg ${ATTRS}>${inner}</svg>`;
}

/** Terminal — bash/shell tool */
export const Terminal = svg(
  '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
);

/** FileText — file-read tool */
export const FileText = svg(
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
);

/** FilePen — edit/patch tool */
export const FilePen = svg(
  '<path d="M12 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v3"/><path d="M14.5 17.5 17 15l4 4-2.5 2.5-4-4z"/><path d="m17 15-1.5-1.5"/><path d="M21 19l-1.5-1.5"/>',
);

/** Search — web-search tool */
export const Search = svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>');

/** Globe — web-fetch tool */
export const Globe = svg(
  '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
);

/** CircleCheck — done/success terminator */
export const CircleCheck = svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>');

/** Loader2 — pending/running spinner (rotate via CSS) */
export const Loader2 = svg('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>');

/** Settings — settings icon */
export const Settings = svg(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
);

/** MessageSquare — chat/conversations */
export const MessageSquare = svg(
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
);

/** SquarePen — new chat / compose */
export const SquarePen = svg(
  '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
);

/** ChevronRight — expand chevron */
export const ChevronRight = svg('<polyline points="9 18 15 12 9 6"/>');

/** Folder — fs-list tool */
export const Folder = svg(
  '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
);

/** Plug — mcp-custom tool */
export const Plug = svg(
  '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z"/>',
);

/** ArrowUp — send button */
export const ArrowUp = svg(
  '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
);

/**
 * Render a Lucide SVG string as an inline SVG element with the given size.
 * The element uses currentColor so it inherits its parent's color.
 * Size is applied as width/height style to preserve the viewBox aspect ratio.
 */
export function renderIcon(svgString: string, size: number, extraClass?: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = `agi-icon${extraClass ? ' ' + extraClass : ''}`;
  wrapper.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;`;
  // Safe: all SVG strings in this module are static literals, not user input.
  wrapper.innerHTML = svgString;
  const svgEl = wrapper.querySelector('svg');
  if (svgEl) {
    svgEl.style.width = `${size}px`;
    svgEl.style.height = `${size}px`;
  }
  return wrapper;
}
