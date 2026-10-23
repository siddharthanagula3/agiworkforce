const SVG_ALLOWED_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'text',
  'tspan',
  'defs',
  'clippath',
  'use',
  'image',
  'marker',
  'symbol',
  'title',
  'desc',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'mask',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComposite',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feOffset',
]);

// The comparison lowercases the tag name, so the allow list has to be keyed
// the same way. Written as authored, the camel-cased SVG element names
// (linearGradient, feGaussianBlur, ...) never matched and every gradient and
// filter primitive was being stripped out of otherwise valid artwork.
const SVG_ALLOWED_TAG_KEYS = new Set([...SVG_ALLOWED_TAGS].map((tag) => tag.toLowerCase()));

const SVG_ALLOWED_ATTRS = new Set([
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'd',
  'x',
  'y',
  'dx',
  'dy',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'viewBox',
  'xmlns',
  'transform',
  'opacity',
  'class',
  'id',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'font-size',
  'font-weight',
  'font-style',
  'preserveAspectRatio',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-end',
  'marker-mid',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'orient',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'patternTransform',
]);

// Same case-folding bug the tag allowlist above already had to work around:
// the comparison lowercases the attribute name, so keys like viewBox,
// preserveAspectRatio, refX/refY, markerWidth/markerHeight and the
// gradient/pattern *Units/*Transform pairs never matched their own
// lowercased selves and were stripped from every sanitized SVG. Losing
// viewBox meant a diagram had no way to scale into a narrower box - the root
// <svg>'s default overflow: hidden clipped it instead. Losing refX/refY/
// markerWidth/markerHeight left arrowhead markers with only spec defaults
// (3x3, no offset), which drew a mermaid edge's arrowhead as a distorted loop
// instead of a triangle.
const SVG_ALLOWED_ATTR_KEYS = new Set([...SVG_ALLOWED_ATTRS].map((attr) => attr.toLowerCase()));

/**
 * Safely sanitize an SVG string by stripping disallowed tags/attributes.
 *
 * AUDIT-FIX ART-17: exported so `ArtifactPanel` can run the SAME allowlist
 * before it renders an SVG artifact. The panel used to embed unsanitized SVG
 * bytes directly while this sibling renderer sanitized them, one package, two
 * different answers to "is this SVG safe?".
 */
export function sanitizeSvg(raw: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) return '';

    if (doc.documentElement.tagName.toLowerCase() !== 'svg') return '';

    function sanitizeNode(node: Element) {
      const tagName = node.tagName.toLowerCase();
      if (!SVG_ALLOWED_TAG_KEYS.has(tagName)) {
        node.parentNode?.removeChild(node);
        return;
      }
      const attrs = Array.from(node.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (!SVG_ALLOWED_ATTR_KEYS.has(name)) {
          node.removeAttribute(attr.name);
        }
        if (name === 'href' || name === 'xlink:href') {
          const raw = attr.value.trim();
          let scheme: string | null = null;
          try {
            scheme = new URL(raw, 'https://placeholder.invalid/').protocol
              .replace(/:$/, '')
              .toLowerCase();
          } catch {
            scheme = null;
          }
          const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
          if (scheme && !SAFE_SCHEMES.has(scheme)) {
            node.removeAttribute(attr.name);
          }
        }
      }
      Array.from(node.childNodes).forEach(sanitizeChild);
    }

    // The output is re-parsed by the HTML parser (innerHTML), which reads XML
    // comments, processing instructions and CDATA differently and lets markup
    // inside them break out of the SVG as live HTML.
    function sanitizeChild(child: ChildNode) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        sanitizeNode(child as Element);
      } else if (child.nodeType === Node.CDATA_SECTION_NODE) {
        child.replaceWith(doc.createTextNode((child as CDATASection).data));
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    }

    const svgEl = doc.documentElement;
    sanitizeNode(svgEl);
    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return '';
  }
}
